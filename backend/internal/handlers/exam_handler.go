package handlers

import (
	"net/http"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ExamHandler struct {
	examRepo repository.ExamRepository
}

func NewExamHandler(examRepo repository.ExamRepository) *ExamHandler {
	return &ExamHandler{examRepo: examRepo}
}

type createExamRequest struct {
	SubjectID           string   `json:"subject_id"           binding:"required"`
	Title               string   `json:"title"                binding:"required"`
	Instructions        string   `json:"instructions"`
	TimeLimitMinutes    *int     `json:"time_limit_minutes"`
	PassingScore        *float64 `json:"passing_score"`
	RandomizeQuestions  bool     `json:"randomize_questions"`
	QuestionIDs         []string `json:"question_ids"         binding:"required,min=1"`
}

// POST /api/exams
func (h *ExamHandler) Create(c *gin.Context) {
	var req createExamRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	subjectID, _ := uuid.Parse(req.SubjectID)
	createdBy, _ := uuid.Parse(c.GetString("userID"))

	questionUUIDs := make([]uuid.UUID, 0, len(req.QuestionIDs))
	for _, qid := range req.QuestionIDs {
		uid, err := uuid.Parse(qid)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question_id: " + qid})
			return
		}
		questionUUIDs = append(questionUUIDs, uid)
	}

	exam, err := h.examRepo.Create(c.Request.Context(), subjectID, createdBy, req.Title, req.Instructions,
		req.TimeLimitMinutes, req.PassingScore, req.RandomizeQuestions, questionUUIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, exam)
}

// GET /api/exams/:id
func (h *ExamHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid exam id"})
		return
	}
	exam, err := h.examRepo.FindByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "exam not found"})
		return
	}
	c.JSON(http.StatusOK, exam)
}

// PATCH /api/exams/:id/status
func (h *ExamHandler) UpdateStatus(c *gin.Context) {
	id, _ := uuid.Parse(c.Param("id"))
	var body struct {
		Status models.ExamStatus `json:"status" binding:"required,oneof=draft published closed"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.examRepo.UpdateStatus(c.Request.Context(), id, body.Status); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "status updated"})
}

// GET /api/exams?subject_id=<uuid>  (educator: list by subject)
func (h *ExamHandler) List(c *gin.Context) {
	subjectID, err := uuid.Parse(c.Query("subject_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject_id"})
		return
	}
	exams, err := h.examRepo.ListBySubject(c.Request.Context(), subjectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if exams == nil {
		exams = []*models.Exam{}
	}
	c.JSON(http.StatusOK, exams)
}

// GET /api/student/exams  — published exams for enrolled subjects
func (h *ExamHandler) ListForStudent(c *gin.Context) {
	studentID, _ := uuid.Parse(c.GetString("userID"))
	exams, err := h.examRepo.ListPublishedForStudent(c.Request.Context(), studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if exams == nil {
		exams = []*models.Exam{}
	}
	c.JSON(http.StatusOK, exams)
}

// DELETE /api/exams/:id
func (h *ExamHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid exam id"})
		return
	}
	if err := h.examRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "exam deleted"})
}

// PUT /api/exams/:id
func (h *ExamHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid exam id"})
		return
	}
	var req struct {
		Title              string   `json:"title"               binding:"required"`
		Instructions       string   `json:"instructions"`
		TimeLimitMinutes   *int     `json:"time_limit_minutes"`
		PassingScore       *float64 `json:"passing_score"`
		RandomizeQuestions bool     `json:"randomize_questions"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.examRepo.Update(c.Request.Context(), id, req.Title, req.Instructions,
		req.TimeLimitMinutes, req.PassingScore, req.RandomizeQuestions); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "exam updated"})
}

// GET /api/exams/:id/questions
func (h *ExamHandler) GetQuestions(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid exam id"})
		return
	}
	questions, err := h.examRepo.GetQuestions(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if questions == nil {
		questions = []*models.GeneratedQuestion{}
	}
	c.JSON(http.StatusOK, questions)
}
