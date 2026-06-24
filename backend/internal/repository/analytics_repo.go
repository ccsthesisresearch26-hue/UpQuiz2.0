package repository

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SubjectAnalytics is the shape returned by the analytics endpoint.
type SubjectAnalytics struct {
	AverageScore   float64          `json:"average_score"`
	AttemptCount   int              `json:"attempt_count"`
	TopicBreakdown []TopicBreakdown `json:"topic_breakdown"`
}

type TopicBreakdown struct {
	TopicTag string `json:"topic_tag"`
	Correct  int    `json:"correct"`
	Total    int    `json:"total"`
}

type AnalyticsRepository interface {
	SubjectSummary(ctx context.Context, subjectID uuid.UUID) (*SubjectAnalytics, error)
	StudentTopics(ctx context.Context, studentID, subjectID uuid.UUID) ([]TopicBreakdown, error)
}

type analyticsRepo struct{ db *pgxpool.Pool }

func NewAnalyticsRepo(db *pgxpool.Pool) AnalyticsRepository { return &analyticsRepo{db: db} }

func (r *analyticsRepo) SubjectSummary(ctx context.Context, subjectID uuid.UUID) (*SubjectAnalytics, error) {
	result := &SubjectAnalytics{TopicBreakdown: []TopicBreakdown{}}

	err := r.db.QueryRow(ctx, `
		SELECT
			COALESCE(AVG(a.percentage), 0),
			COUNT(*)
		FROM student_exam_attempts a
		JOIN exams e ON e.id = a.exam_id
		WHERE e.subject_id = $1
		  AND a.status IN ('submitted', 'scored')
	`, subjectID).Scan(&result.AverageScore, &result.AttemptCount)
	if err != nil {
		return nil, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT
			gq.topic_tag,
			COUNT(sa.id) FILTER (WHERE sa.is_correct = true) AS correct,
			COUNT(sa.id) AS total
		FROM student_answers sa
		JOIN generated_questions gq ON gq.id = sa.question_id
		JOIN student_exam_attempts att ON att.id = sa.attempt_id
		JOIN exams e ON e.id = att.exam_id
		WHERE e.subject_id = $1
		  AND gq.topic_tag IS NOT NULL
		  AND gq.topic_tag <> ''
		GROUP BY gq.topic_tag
		ORDER BY total DESC
	`, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var t TopicBreakdown
		if err := rows.Scan(&t.TopicTag, &t.Correct, &t.Total); err != nil {
			return nil, err
		}
		result.TopicBreakdown = append(result.TopicBreakdown, t)
	}

	return result, nil
}

func (r *analyticsRepo) StudentTopics(ctx context.Context, studentID, subjectID uuid.UUID) ([]TopicBreakdown, error) {
	rows, err := r.db.Query(ctx, `
		SELECT
			gq.topic_tag,
			COUNT(sa.id) FILTER (WHERE sa.is_correct = true) AS correct,
			COUNT(sa.id) AS total
		FROM student_answers sa
		JOIN generated_questions gq ON gq.id = sa.question_id
		JOIN student_exam_attempts att ON att.id = sa.attempt_id
		JOIN exams e ON e.id = att.exam_id
		WHERE att.student_id = $1
		  AND e.subject_id = $2
		  AND gq.topic_tag IS NOT NULL
		  AND gq.topic_tag <> ''
		GROUP BY gq.topic_tag
		ORDER BY (COUNT(sa.id) FILTER (WHERE sa.is_correct = true))::float / NULLIF(COUNT(sa.id),0) ASC
	`, studentID, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []TopicBreakdown
	for rows.Next() {
		var t TopicBreakdown
		if err := rows.Scan(&t.TopicTag, &t.Correct, &t.Total); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	if result == nil {
		result = []TopicBreakdown{}
	}
	return result, nil
}
