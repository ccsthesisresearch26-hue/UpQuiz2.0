// Package repository defines all data access interfaces.
// Each interface has a PostgreSQL implementation inside this package.
package repository

import (
	"context"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/google/uuid"
)

// ─── User ─────────────────────────────────────────────────────────────────────

type UserRepository interface {
	FindByEmail(ctx context.Context, email string) (*models.User, error)
	FindByID(ctx context.Context, id string) (*models.User, error)
	Create(ctx context.Context, email, password, firstName, lastName, role string) (*models.User, error)
	List(ctx context.Context) ([]*models.User, error)
	UpdateRole(ctx context.Context, id uuid.UUID, role models.UserRole) error
	Deactivate(ctx context.Context, id uuid.UUID) error
}

// ─── Subject ──────────────────────────────────────────────────────────────────

type SubjectRepository interface {
	Create(ctx context.Context, name, description string, educatorID uuid.UUID) (*models.Subject, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.Subject, error)
	ListByEducator(ctx context.Context, educatorID uuid.UUID) ([]*models.Subject, error)
	ListAll(ctx context.Context) ([]*models.Subject, error)
	EnrollStudent(ctx context.Context, subjectID, studentID uuid.UUID) error
	ListForStudent(ctx context.Context, studentID uuid.UUID) ([]*models.Subject, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// ─── Document ─────────────────────────────────────────────────────────────────

type DocumentRepository interface {
	Create(ctx context.Context, subjectID, uploadedBy uuid.UUID, originalName, storedPath string, size int64) (*models.UploadedDocument, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.UploadedDocument, error)
	ListBySubject(ctx context.Context, subjectID uuid.UUID) ([]*models.UploadedDocument, error)
	UpdateStatus(ctx context.Context, id uuid.UUID, status, errMsg string) error
	Delete(ctx context.Context, id uuid.UUID) error
}

// ─── Question ─────────────────────────────────────────────────────────────────

type QuestionRepository interface {
	BulkCreate(ctx context.Context, questions []*models.GeneratedQuestion) error
	FindByID(ctx context.Context, id uuid.UUID) (*models.GeneratedQuestion, error)
	ListBySubject(ctx context.Context, subjectID uuid.UUID, approvedOnly bool) ([]*models.GeneratedQuestion, error)
	Approve(ctx context.Context, id uuid.UUID) error
	Update(ctx context.Context, q *models.GeneratedQuestion) error
	SoftDelete(ctx context.Context, id uuid.UUID) error
}

// ─── Exam ─────────────────────────────────────────────────────────────────────

type ExamRepository interface {
	Create(ctx context.Context, subjectID, createdBy uuid.UUID, title, instructions string,
		timeLimitMinutes *int, passingScore *float64, randomize bool, questionIDs []uuid.UUID) (*models.Exam, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.Exam, error)
	ListBySubject(ctx context.Context, subjectID uuid.UUID) ([]*models.Exam, error)
	ListPublishedForStudent(ctx context.Context, studentID uuid.UUID) ([]*models.Exam, error)
	Update(ctx context.Context, id uuid.UUID, title, instructions string, timeLimitMinutes *int, passingScore *float64, randomize bool) error
	UpdateStatus(ctx context.Context, id uuid.UUID, status models.ExamStatus) error
	GetQuestions(ctx context.Context, examID uuid.UUID) ([]*models.GeneratedQuestion, error)
	Delete(ctx context.Context, id uuid.UUID) error
}

// ─── Attempt ──────────────────────────────────────────────────────────────────

type AttemptRepository interface {
	FindOrCreate(ctx context.Context, examID, studentID uuid.UUID) (*models.StudentExamAttempt, error)
	FindByID(ctx context.Context, id uuid.UUID) (*models.StudentExamAttempt, error)
	UpsertAnswer(ctx context.Context, attemptID, questionID uuid.UUID, answerText string) error
	GetAnswers(ctx context.Context, attemptID uuid.UUID) ([]*models.StudentAnswer, error)
	Submit(ctx context.Context, attemptID uuid.UUID, total, max, pct float64) error
}
