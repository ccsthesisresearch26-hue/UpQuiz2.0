package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ccsthesis/examplatform/internal/config"
	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type QuestionHandler struct {
	questionRepo repository.QuestionRepository
	aiServiceURL string
	uploadsDir   string
	httpClient   *http.Client
}

func NewQuestionHandler(questionRepo repository.QuestionRepository, cfg ...*config.Config) *QuestionHandler {
	aiURL := "http://ai-service:3001"
	uploadsDir := "/app/uploads"
	if len(cfg) > 0 && cfg[0] != nil {
		aiURL = cfg[0].AIServiceURL
		uploadsDir = cfg[0].UploadsDir
	}
	return &QuestionHandler{
		questionRepo: questionRepo,
		aiServiceURL: aiURL,
		uploadsDir:   uploadsDir,
		httpClient:   &http.Client{Timeout: 5 * time.Minute},
	}
}

// GET /api/questions?subject_id=<uuid>&approved=true
func (h *QuestionHandler) List(c *gin.Context) {
	subjectID, err := uuid.Parse(c.Query("subject_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject_id"})
		return
	}

	approvedOnly := c.Query("approved") == "true"
	questions, err := h.questionRepo.ListBySubject(c.Request.Context(), subjectID, approvedOnly)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if questions == nil {
		questions = []*models.GeneratedQuestion{}
	}
	c.JSON(http.StatusOK, questions)
}

// POST /api/questions/bulk
func (h *QuestionHandler) BulkCreate(c *gin.Context) {
	var body struct {
		SubjectID string `json:"subject_id" binding:"required"`
		Questions []struct {
			DocumentID    string      `json:"document_id"`
			ChunkID       string      `json:"chunk_id"`
			QuestionText  string      `json:"question_text"  binding:"required"`
			QuestionType  string      `json:"question_type"  binding:"required"`
			Difficulty    string      `json:"difficulty"`
			TopicTag      string      `json:"topic_tag"`
			CorrectAnswer string      `json:"correct_answer" binding:"required"`
			Choices       interface{} `json:"choices"`
		} `json:"questions" binding:"required,min=1"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	createdBy, _ := uuid.Parse(c.GetString("userID"))
	subjectID, err := uuid.Parse(body.SubjectID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject_id"})
		return
	}

	qs := make([]*models.GeneratedQuestion, 0, len(body.Questions))
	for _, q := range body.Questions {
		docID, err := uuid.Parse(q.DocumentID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document_id"})
			return
		}
		var chunkIDPtr *uuid.UUID
		if q.ChunkID != "" {
			cid, err := uuid.Parse(q.ChunkID)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid chunk_id"})
				return
			}
			chunkIDPtr = &cid
		}

		difficulty := models.DifficultyLevel(q.Difficulty)
		if difficulty == "" {
			difficulty = models.DiffMedium
		}

		qs = append(qs, &models.GeneratedQuestion{
			DocumentID:    docID,
			ChunkID:       chunkIDPtr,
			SubjectID:     subjectID,
			CreatedBy:     createdBy,
			QuestionText:  q.QuestionText,
			QuestionType:  models.QuestionType(q.QuestionType),
			Difficulty:    difficulty,
			TopicTag:      q.TopicTag,
			CorrectAnswer: q.CorrectAnswer,
			Choices:       q.Choices,
		})
	}

	if err := h.questionRepo.BulkCreate(c.Request.Context(), qs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"created": len(qs)})
}

// PATCH /api/questions/:id/approve
func (h *QuestionHandler) Approve(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}
	if err := h.questionRepo.Approve(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "question approved"})
}

// PUT /api/questions/:id
func (h *QuestionHandler) Update(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}

	var body struct {
		QuestionText  string      `json:"question_text"`
		Difficulty    string      `json:"difficulty"`
		TopicTag      string      `json:"topic_tag"`
		CorrectAnswer string      `json:"correct_answer"`
		Choices       interface{} `json:"choices"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	q := &models.GeneratedQuestion{
		ID:            id,
		QuestionText:  body.QuestionText,
		Difficulty:    models.DifficultyLevel(body.Difficulty),
		TopicTag:      body.TopicTag,
		CorrectAnswer: body.CorrectAnswer,
		Choices:       body.Choices,
	}
	if err := h.questionRepo.Update(c.Request.Context(), q); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "question updated"})
}

// POST /api/questions/:id/fill-choices
func (h *QuestionHandler) FillChoices(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}

	q, err := h.questionRepo.FindByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
		return
	}

	payload, _ := json.Marshal(map[string]string{
		"question_text":  q.QuestionText,
		"correct_answer": q.CorrectAnswer,
	})
	url := fmt.Sprintf("%s/api/rag/fill-choices", h.aiServiceURL)
	req, err := http.NewRequestWithContext(c.Request.Context(), http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not build AI request"})
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := h.httpClient.Do(req)
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI service unavailable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		c.Data(resp.StatusCode, "application/json", body)
		return
	}

	var aiResp struct {
		Choices interface{} `json:"choices"`
	}
	if err := json.Unmarshal(body, &aiResp); err != nil || aiResp.Choices == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "invalid AI response"})
		return
	}

	// Detect which letter slot (A/B/C/D) holds the correct answer,
	// then persist that letter as the new correct_answer.
	correctKey := detectCorrectKey(aiResp.Choices, q.CorrectAnswer)
	if correctKey != "" {
		q.CorrectAnswer = correctKey
	}

	q.Choices = aiResp.Choices
	if err := h.questionRepo.Update(c.Request.Context(), q); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"choices": aiResp.Choices, "correct_key": correctKey})
}

// detectCorrectKey matches the stored correctAnswer text against the AI-generated
// choices and returns the letter key (A/B/C/D) of the matching choice.
func detectCorrectKey(choices interface{}, correctAnswer string) string {
	norm := func(s string) string {
		return strings.ToLower(strings.TrimSpace(s))
	}
	target := norm(correctAnswer)
	if target == "" {
		return ""
	}

	tryMatch := func(key, text string) string {
		t := norm(text)
		if t == "" {
			return ""
		}
		if t == target || strings.Contains(t, target) || strings.Contains(target, t) {
			return strings.ToUpper(key)
		}
		return ""
	}

	// Array format: [{"key":"A","text":"..."}, ...]
	if arr, ok := choices.([]interface{}); ok {
		for i, item := range arr {
			m, ok := item.(map[string]interface{})
			if !ok {
				continue
			}
			key := fmt.Sprintf("%c", 'A'+i)
			if k, ok := m["key"].(string); ok && k != "" {
				key = k
			}
			text := fmt.Sprintf("%v", m["text"])
			if hit := tryMatch(key, text); hit != "" {
				return hit
			}
		}
	}

	// Object format: {"A":"...","B":"...",...}
	if obj, ok := choices.(map[string]interface{}); ok {
		for key, val := range obj {
			if hit := tryMatch(key, fmt.Sprintf("%v", val)); hit != "" {
				return hit
			}
		}
	}

	return ""
}

// DELETE /api/questions/:id
func (h *QuestionHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}
	if err := h.questionRepo.SoftDelete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "question deleted"})
}

// POST /api/questions/:id/image
func (h *QuestionHandler) UploadImage(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}

	file, header, err := c.Request.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image file is required"})
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	allowed := map[string]bool{".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true}
	if !allowed[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported image type; allowed: JPG, PNG, GIF, WEBP"})
		return
	}

	imgDir := filepath.Join(h.uploadsDir, "question-images")
	if err := os.MkdirAll(imgDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create image directory"})
		return
	}

	filename := fmt.Sprintf("%s%s", uuid.New().String(), ext)
	storedPath := filepath.Join(imgDir, filename)
	if err := c.SaveUploadedFile(header, storedPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save image"})
		return
	}

	imageURL := "/uploads/question-images/" + filename
	if err := h.questionRepo.SetImageURL(c.Request.Context(), id, &imageURL); err != nil {
		os.Remove(storedPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"image_url": imageURL})
}

// DELETE /api/questions/:id/image
func (h *QuestionHandler) RemoveImage(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid question id"})
		return
	}

	q, err := h.questionRepo.FindByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "question not found"})
		return
	}

	if q.ImageURL != nil && *q.ImageURL != "" {
		filename := filepath.Base(*q.ImageURL)
		os.Remove(filepath.Join(h.uploadsDir, "question-images", filename))
	}

	if err := h.questionRepo.SetImageURL(c.Request.Context(), id, nil); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "image removed"})
}
