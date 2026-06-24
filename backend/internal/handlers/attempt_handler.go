package handlers

import (
	"net/http"

	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/ccsthesis/examplatform/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AttemptHandler struct {
	attemptRepo repository.AttemptRepository
	scorer      *services.ScoringService
}

func NewAttemptHandler(attemptRepo repository.AttemptRepository, scorer *services.ScoringService) *AttemptHandler {
	return &AttemptHandler{attemptRepo: attemptRepo, scorer: scorer}
}

// POST /api/exams/:examID/attempt   — start or resume attempt
func (h *AttemptHandler) StartAttempt(c *gin.Context) {
	examID, err := uuid.Parse(c.Param("examID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid exam id"})
		return
	}
	studentID, _ := uuid.Parse(c.GetString("userID"))

	attempt, err := h.attemptRepo.FindOrCreate(c.Request.Context(), examID, studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, attempt)
}

// POST /api/attempts/:attemptID/answers   — save answers (auto-save)
func (h *AttemptHandler) SaveAnswers(c *gin.Context) {
	attemptID, err := uuid.Parse(c.Param("attemptID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attempt id"})
		return
	}
	var body struct {
		Answers []struct {
			QuestionID string `json:"question_id"`
			AnswerText string `json:"answer_text"`
		} `json:"answers"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	for _, a := range body.Answers {
		qID, err := uuid.Parse(a.QuestionID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
			return
		}
		if err := h.attemptRepo.UpsertAnswer(c.Request.Context(), attemptID, qID, a.AnswerText); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}
	c.JSON(http.StatusOK, gin.H{"message": "answers saved"})
}

// POST /api/attempts/:attemptID/submit
func (h *AttemptHandler) Submit(c *gin.Context) {
	attemptID, err := uuid.Parse(c.Param("attemptID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attempt id"})
		return
	}
	studentID, _ := uuid.Parse(c.GetString("userID"))

	result, err := h.scorer.ScoreAttempt(c.Request.Context(), attemptID, studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GET /api/attempts/:attemptID
func (h *AttemptHandler) GetAttempt(c *gin.Context) {
	attemptID, err := uuid.Parse(c.Param("attemptID"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attempt id"})
		return
	}
	attempt, err := h.attemptRepo.FindByID(c.Request.Context(), attemptID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attempt not found"})
		return
	}
	c.JSON(http.StatusOK, attempt)
}
