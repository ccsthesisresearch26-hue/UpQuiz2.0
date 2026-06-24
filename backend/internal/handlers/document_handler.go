package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/ccsthesis/examplatform/internal/config"
	"github.com/ccsthesis/examplatform/internal/models"
	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type DocumentHandler struct {
	docRepo  repository.DocumentRepository
	cfg      *config.Config
}

func NewDocumentHandler(docRepo repository.DocumentRepository, cfg *config.Config) *DocumentHandler {
	return &DocumentHandler{docRepo: docRepo, cfg: cfg}
}

// POST /api/documents/upload
func (h *DocumentHandler) Upload(c *gin.Context) {
	subjectID := c.PostForm("subject_id")
	if subjectID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "subject_id is required"})
		return
	}
	sID, err := uuid.Parse(subjectID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject_id"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file is required"})
		return
	}
	defer file.Close()

	allowedExts := map[string]bool{
		".pdf": true, ".docx": true, ".doc": true,
		".pptx": true, ".xlsx": true, ".xls": true,
		".txt": true, ".md": true, ".csv": true,
		".rtf": true, ".html": true, ".htm": true,
		".odt": true,
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if !allowedExts[ext] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "unsupported file type; allowed: PDF, DOCX, DOC, PPTX, XLSX, XLS, TXT, MD, CSV, RTF, HTML, ODT"})
		return
	}

	userID, _ := c.Get("userID")

	// Unique filename to avoid collisions
	storedName := fmt.Sprintf("%s_%d%s", uuid.New().String(), time.Now().Unix(), filepath.Ext(header.Filename))
	storedPath := filepath.Join(h.cfg.UploadsDir, storedName)

	if err := c.SaveUploadedFile(header, storedPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save file"})
		return
	}

	uID, _ := uuid.Parse(userID.(string))

	doc, err := h.docRepo.Create(c.Request.Context(), sID, uID, header.Filename, storedPath, header.Size)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not save document record"})
		return
	}

	// Kick off AI processing in the background so the upload response returns immediately.
	go h.triggerProcessing(doc.ID.String(), subjectID, storedPath)

	c.JSON(http.StatusCreated, doc)
}

func (h *DocumentHandler) triggerProcessing(docID, subjectID, storedPath string) {
	payload, _ := json.Marshal(map[string]string{
		"document_id": docID,
		"subject_id":  subjectID,
		"stored_path": storedPath,
	})
	url := fmt.Sprintf("%s/api/document/process", h.cfg.AIServiceURL)
	resp, err := http.Post(url, "application/json", bytes.NewReader(payload)) //nolint:noctx
	if err != nil {
		log.Printf("[document] AI processing request failed for %s: %v", docID, err)
		return
	}
	resp.Body.Close()
	log.Printf("[document] AI processing triggered for %s, status %d", docID, resp.StatusCode)
}

// GET /api/documents/:id
func (h *DocumentHandler) GetByID(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document id"})
		return
	}
	doc, err := h.docRepo.FindByID(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "document not found"})
		return
	}
	c.JSON(http.StatusOK, doc)
}

// DELETE /api/documents/:id
func (h *DocumentHandler) Delete(c *gin.Context) {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid document id"})
		return
	}
	if err := h.docRepo.Delete(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "document deleted"})
}

// GET /api/documents?subject_id=<uuid>
func (h *DocumentHandler) ListBySubject(c *gin.Context) {
	subjectID, err := uuid.Parse(c.Query("subject_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid subject_id"})
		return
	}
	docs, err := h.docRepo.ListBySubject(c.Request.Context(), subjectID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if docs == nil {
		docs = []*models.UploadedDocument{}
	}
	c.JSON(http.StatusOK, docs)
}
