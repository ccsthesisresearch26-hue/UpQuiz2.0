package handlers

import (
	"net/http"

	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type SubjectHandler struct {
	subjectRepo repository.SubjectRepository
	userRepo    repository.UserRepository
}

func NewSubjectHandler(subjectRepo repository.SubjectRepository, userRepo repository.UserRepository) *SubjectHandler {
	return &SubjectHandler{subjectRepo: subjectRepo, userRepo: userRepo}
}

// POST /api/subjects
func (h *SubjectHandler) Create(c *gin.Context) {
	var body struct {
		Name        string `json:"name"        binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	educatorID, _ := uuid.Parse(c.GetString("userID"))
	subject, err := h.subjectRepo.Create(c.Request.Context(), body.Name, body.Description, educatorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, subject)
}

// GET /api/subjects?educator_id=<uuid>   OR   /api/subjects (admin sees all)
func (h *SubjectHandler) List(c *gin.Context) {
	role := c.GetString("userRole")

	if role == "admin" {
		subjects, err := h.subjectRepo.ListAll(c.Request.Context())
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if subjects == nil {
			subjects = []*models.Subject{}
		}
		c.JSON(http.StatusOK, subjects)
		return
	}

	educatorID, _ := uuid.Parse(c.GetString("userID"))
	if qID := c.Query("educator_id"); qID != "" {
		parsed, err := uuid.Parse(qID)
		if err == nil {
			educatorID = parsed
		}
	}

	subjects, err := h.subjectRepo.ListByEducator(c.Request.Context(), educatorID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if subjects == nil {
		subjects = []*models.Subject{}
	}
	c.JSON(http.StatusOK, subjects)
}

// GET /api/subjects/:id
func (h *SubjectHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject id"})
		return
	}
	subject, err := h.subjectRepo.FindByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "subject not found"})
		return
	}
	c.JSON(http.StatusOK, subject)
}

// POST /api/subjects/:id/enroll   body: { email } or { student_id }
func (h *SubjectHandler) Enroll(c *gin.Context) {
	subjectID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject id"})
		return
	}

	var body struct {
		Email     string `json:"email"`
		StudentID string `json:"student_id"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var studentID uuid.UUID
	if body.Email != "" {
		user, err := h.userRepo.FindByEmail(c.Request.Context(), body.Email)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "no student found with that email"})
			return
		}
		if user.Role != "student" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "user is not a student"})
			return
		}
		studentID = user.ID
	} else if body.StudentID != "" {
		studentID, err = uuid.Parse(body.StudentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid student_id"})
			return
		}
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "email or student_id is required"})
		return
	}

	if err := h.subjectRepo.EnrollStudent(c.Request.Context(), subjectID, studentID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "student enrolled"})
}

// DELETE /api/subjects/:id
func (h *SubjectHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject id"})
		return
	}
	if err := h.subjectRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "subject deleted"})
}

// GET /api/subjects/my   — student: list enrolled subjects
func (h *SubjectHandler) ListForStudent(c *gin.Context) {
	studentID, _ := uuid.Parse(c.GetString("userID"))
	subjects, err := h.subjectRepo.ListForStudent(c.Request.Context(), studentID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if subjects == nil {
		subjects = []*models.Subject{}
	}
	c.JSON(http.StatusOK, subjects)
}
