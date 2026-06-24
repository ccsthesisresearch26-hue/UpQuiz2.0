package repository

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type examRepo struct{ db *pgxpool.Pool }

func NewExamRepo(db *pgxpool.Pool) ExamRepository { return &examRepo{db: db} }

func (r *examRepo) Create(ctx context.Context, subjectID, createdBy uuid.UUID, title, instructions string,
	timeLimitMinutes *int, passingScore *float64, randomize bool, questionIDs []uuid.UUID,
	weights map[uuid.UUID]float64) (*models.Exam, error) {

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	exam := &models.Exam{}
	err = tx.QueryRow(ctx,
		`INSERT INTO exams(subject_id,created_by,title,instructions,time_limit_minutes,passing_score,randomize_questions)
		 VALUES($1,$2,$3,$4,$5,$6,$7)
		 RETURNING id,subject_id,created_by,title,instructions,time_limit_minutes,passing_score,randomize_questions,status,created_at,updated_at`,
		subjectID, createdBy, title, instructions, timeLimitMinutes, passingScore, randomize).
		Scan(&exam.ID, &exam.SubjectID, &exam.CreatedBy, &exam.Title, &exam.Instructions,
			&exam.TimeLimitMinutes, &exam.PassingScore, &exam.RandomizeQuestions, &exam.Status,
			&exam.CreatedAt, &exam.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert exam: %w", err)
	}

	for pos, qID := range questionIDs {
		pts := 1.0
		if weights != nil {
			if w, ok := weights[qID]; ok {
				pts = w
			}
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO exam_questions(exam_id,question_id,position,points) VALUES($1,$2,$3,$4)`,
			exam.ID, qID, pos+1, pts)
		if err != nil {
			return nil, fmt.Errorf("insert exam_question: %w", err)
		}
	}

	return exam, tx.Commit(ctx)
}

func (r *examRepo) FindByID(ctx context.Context, id uuid.UUID) (*models.Exam, error) {
	exam := &models.Exam{}
	err := r.db.QueryRow(ctx,
		`SELECT id,subject_id,created_by,title,instructions,time_limit_minutes,passing_score,
		        randomize_questions,status,available_from,available_until,created_at,updated_at
		 FROM exams WHERE id=$1`, id).
		Scan(&exam.ID, &exam.SubjectID, &exam.CreatedBy, &exam.Title, &exam.Instructions,
			&exam.TimeLimitMinutes, &exam.PassingScore, &exam.RandomizeQuestions, &exam.Status,
			&exam.AvailableFrom, &exam.AvailableUntil, &exam.CreatedAt, &exam.UpdatedAt)
	return exam, err
}

func (r *examRepo) ListBySubject(ctx context.Context, subjectID uuid.UUID) ([]*models.Exam, error) {
	rows, err := r.db.Query(ctx,
		`SELECT id,subject_id,created_by,title,status,time_limit_minutes,available_from,available_until,created_at
		 FROM exams WHERE subject_id=$1 ORDER BY created_at DESC`, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var exams []*models.Exam
	for rows.Next() {
		e := &models.Exam{}
		if err := rows.Scan(&e.ID, &e.SubjectID, &e.CreatedBy, &e.Title, &e.Status,
			&e.TimeLimitMinutes, &e.AvailableFrom, &e.AvailableUntil, &e.CreatedAt); err != nil {
			return nil, err
		}
		exams = append(exams, e)
	}
	return exams, nil
}

func (r *examRepo) Update(ctx context.Context, id uuid.UUID, title, instructions string, timeLimitMinutes *int, passingScore *float64, randomize bool) error {
	_, err := r.db.Exec(ctx,
		`UPDATE exams SET title=$1,instructions=$2,time_limit_minutes=$3,passing_score=$4,randomize_questions=$5,updated_at=NOW() WHERE id=$6`,
		title, instructions, timeLimitMinutes, passingScore, randomize, id)
	return err
}

func (r *examRepo) UpdateStatus(ctx context.Context, id uuid.UUID, status models.ExamStatus) error {
	_, err := r.db.Exec(ctx, `UPDATE exams SET status=$1,updated_at=NOW() WHERE id=$2`, status, id)
	return err
}

func (r *examRepo) Delete(ctx context.Context, id uuid.UUID) error {
	tag, err := r.db.Exec(ctx, `DELETE FROM exams WHERE id=$1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("exam not found")
	}
	return nil
}

func (r *examRepo) GetQuestions(ctx context.Context, examID uuid.UUID) ([]*models.GeneratedQuestion, error) {
	rows, err := r.db.Query(ctx,
		`SELECT gq.id,gq.question_text,gq.question_type,gq.difficulty,gq.topic_tag,gq.correct_answer,gq.choices,eq.points
		 FROM generated_questions gq
		 JOIN exam_questions eq ON eq.question_id=gq.id
		 WHERE eq.exam_id=$1 ORDER BY eq.position`, examID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var qs []*models.GeneratedQuestion
	for rows.Next() {
		q := &models.GeneratedQuestion{}
		var choicesJSON []byte
		if err := rows.Scan(&q.ID, &q.QuestionText, &q.QuestionType, &q.Difficulty,
			&q.TopicTag, &q.CorrectAnswer, &choicesJSON, &q.Points); err != nil {
			return nil, err
		}
		if len(choicesJSON) > 0 {
			_ = json.Unmarshal(choicesJSON, &q.Choices)
		}
		qs = append(qs, q)
	}
	return qs, nil
}

func (r *examRepo) ReplaceQuestion(ctx context.Context, examID, oldQID, newQID uuid.UUID) error {
	_, err := r.db.Exec(ctx,
		`UPDATE exam_questions SET question_id=$3 WHERE exam_id=$1 AND question_id=$2`,
		examID, oldQID, newQID)
	return err
}

func (r *examRepo) UpdateQuestionPoints(ctx context.Context, examID, questionID uuid.UUID, points float64) error {
	_, err := r.db.Exec(ctx,
		`UPDATE exam_questions SET points=$3 WHERE exam_id=$1 AND question_id=$2`,
		examID, questionID, points)
	return err
}

// ListPublishedForStudent returns all published exams for subjects the student is enrolled in.
func (r *examRepo) ListPublishedForStudent(ctx context.Context, studentID uuid.UUID) ([]*models.Exam, error) {
	rows, err := r.db.Query(ctx, `
		SELECT e.id, e.subject_id, e.created_by, e.title, e.status,
		       e.time_limit_minutes, e.available_from, e.available_until, e.created_at
		FROM exams e
		JOIN subject_enrollments se ON se.subject_id = e.subject_id
		WHERE se.student_id = $1
		  AND e.status = 'published'
		  AND (e.available_until IS NULL OR e.available_until > NOW())
		ORDER BY e.created_at DESC
	`, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var exams []*models.Exam
	for rows.Next() {
		ex := &models.Exam{}
		if err := rows.Scan(&ex.ID, &ex.SubjectID, &ex.CreatedBy, &ex.Title, &ex.Status,
			&ex.TimeLimitMinutes, &ex.AvailableFrom, &ex.AvailableUntil, &ex.CreatedAt); err != nil {
			return nil, err
		}
		exams = append(exams, ex)
	}
	if exams == nil {
		exams = []*models.Exam{}
	}
	return exams, nil
}
