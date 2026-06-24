package repository

import (
	"context"
	"encoding/json"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type questionRepo struct{ db *pgxpool.Pool }

func NewQuestionRepo(db *pgxpool.Pool) QuestionRepository { return &questionRepo{db: db} }

func (r *questionRepo) BulkCreate(ctx context.Context, questions []*models.GeneratedQuestion) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for _, q := range questions {
		choicesJSON, _ := json.Marshal(q.Choices)
		_, err := tx.Exec(ctx,
			`INSERT INTO generated_questions
			 (document_id,chunk_id,subject_id,created_by,question_text,question_type,difficulty,topic_tag,correct_answer,choices)
			 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
			q.DocumentID, q.ChunkID, q.SubjectID, q.CreatedBy, q.QuestionText,
			q.QuestionType, q.Difficulty, q.TopicTag, q.CorrectAnswer, choicesJSON)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (r *questionRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.GeneratedQuestion, error) {
	q := &models.GeneratedQuestion{}
	var choicesJSON []byte
	err := r.db.QueryRow(ctx,
		`SELECT id,document_id,chunk_id,subject_id,created_by,question_text,question_type,
		        difficulty,topic_tag,correct_answer,choices,image_url,is_approved,is_deleted,created_at,updated_at
		 FROM generated_questions WHERE id=$1`, id).
		Scan(&q.ID, &q.DocumentID, &q.ChunkID, &q.SubjectID, &q.CreatedBy, &q.QuestionText,
			&q.QuestionType, &q.Difficulty, &q.TopicTag, &q.CorrectAnswer, &choicesJSON,
			&q.ImageURL, &q.IsApproved, &q.IsDeleted, &q.CreatedAt, &q.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if len(choicesJSON) > 0 {
		_ = json.Unmarshal(choicesJSON, &q.Choices)
	}
	return q, nil
}

func (r *questionRepo) ListBySubject(ctx context.Context, subjectID uuid.UUID, approvedOnly bool) ([]*models.GeneratedQuestion, error) {
	query := `SELECT id,question_text,question_type,difficulty,topic_tag,correct_answer,choices,image_url,is_approved,created_at
	          FROM generated_questions WHERE subject_id=$1 AND is_deleted=false`
	if approvedOnly {
		query += " AND is_approved=true"
	}
	query += " ORDER BY created_at DESC"

	rows, err := r.db.Query(ctx, query, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var qs []*models.GeneratedQuestion
	for rows.Next() {
		q := &models.GeneratedQuestion{}
		var choicesJSON []byte
		if err := rows.Scan(&q.ID, &q.QuestionText, &q.QuestionType, &q.Difficulty,
			&q.TopicTag, &q.CorrectAnswer, &choicesJSON, &q.ImageURL, &q.IsApproved, &q.CreatedAt); err != nil {
			return nil, err
		}
		if len(choicesJSON) > 0 {
			_ = json.Unmarshal(choicesJSON, &q.Choices)
		}
		qs = append(qs, q)
	}
	return qs, nil
}

func (r *questionRepo) SetImageURL(ctx context.Context, id uuid.UUID, imageURL *string) error {
	_, err := r.db.Exec(ctx,
		`UPDATE generated_questions SET image_url=$1, updated_at=NOW() WHERE id=$2`,
		imageURL, id)
	return err
}

func (r *questionRepo) Approve(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `UPDATE generated_questions SET is_approved=true,updated_at=NOW() WHERE id=$1`, id)
	return err
}

func (r *questionRepo) Update(ctx context.Context, q *models.GeneratedQuestion) error {
	choicesJSON, _ := json.Marshal(q.Choices)
	_, err := r.db.Exec(ctx,
		`UPDATE generated_questions
		 SET question_text=$1,difficulty=$2,topic_tag=$3,correct_answer=$4,choices=$5,updated_at=NOW()
		 WHERE id=$6`,
		q.QuestionText, q.Difficulty, q.TopicTag, q.CorrectAnswer, choicesJSON, q.ID)
	return err
}

func (r *questionRepo) SoftDelete(ctx context.Context, id uuid.UUID) error {
	_, err := r.db.Exec(ctx, `UPDATE generated_questions SET is_deleted=true,updated_at=NOW() WHERE id=$1`, id)
	return err
}
