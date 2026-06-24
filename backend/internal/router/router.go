package router

import (
	"net/http"

	"github.com/ccsthesis/examplatform/internal/config"
	"github.com/ccsthesis/examplatform/internal/handlers"
	"github.com/ccsthesis/examplatform/internal/middleware"
	"github.com/ccsthesis/examplatform/internal/repository"
	"github.com/ccsthesis/examplatform/internal/services"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func New(cfg *config.Config, db *pgxpool.Pool) *gin.Engine {
	if cfg.Env == "production" {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// ── CORS ───────────────────────────────────────────────────────────────
	r.Use(func(c *gin.Context) {
		if origin := c.GetHeader("Origin"); origin != "" {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Vary", "Origin")
			c.Header("Access-Control-Allow-Credentials", "true")
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin,Content-Type")
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	})

	// ── Repositories ────────────────────────────────────────────────────────
	userRepo := repository.NewUserRepo(db)
	subjectRepo := repository.NewSubjectRepo(db)
	docRepo := repository.NewDocumentRepo(db)
	questionRepo := repository.NewQuestionRepo(db)
	examRepo := repository.NewExamRepo(db)
	attemptRepo := repository.NewAttemptRepo(db)
	analyticsRepo := repository.NewAnalyticsRepo(db)

	// ── Services ────────────────────────────────────────────────────────────
	scorer := services.NewScoringService(attemptRepo, examRepo, questionRepo, cfg.AIServiceURL)

	// ── Handlers ────────────────────────────────────────────────────────────
	authH := handlers.NewAuthHandler(userRepo, cfg)
	subjectH := handlers.NewSubjectHandler(subjectRepo, userRepo)
	docH := handlers.NewDocumentHandler(docRepo, cfg)
	questionH := handlers.NewQuestionHandler(questionRepo, cfg)
	examH := handlers.NewExamHandler(examRepo)
	attemptH := handlers.NewAttemptHandler(attemptRepo, scorer)
	analyticsH := handlers.NewAnalyticsHandler(analyticsRepo)
	ragH := handlers.NewRAGProxyHandler(cfg)
	adminH := handlers.NewAdminHandler(userRepo)

	api := r.Group("/api")

	// ── Public ──────────────────────────────────────────────────────────────
	api.POST("/auth/login", authH.Login)
	api.POST("/auth/register", authH.Register)
	api.POST("/auth/logout", authH.Logout)

	// ── Authenticated ────────────────────────────────────────────────────────
	auth := api.Group("/")
	auth.Use(middleware.RequireAuth(cfg.JWTSecret))

	auth.GET("/auth/me", authH.Me)

	// ─ Subjects ─────────────────────────────────────────────────────────────
	auth.POST("/subjects", middleware.RequireRole("educator", "admin"), subjectH.Create)
	auth.GET("/subjects", middleware.RequireRole("educator", "admin"), subjectH.List)
	auth.GET("/subjects/:id", subjectH.GetByID)
	auth.POST("/subjects/:id/enroll", middleware.RequireRole("educator", "admin"), subjectH.Enroll)
	auth.DELETE("/subjects/:id", middleware.RequireRole("educator", "admin"), subjectH.Delete)
	auth.GET("/subjects/my", middleware.RequireRole("student"), subjectH.ListForStudent)

	// ─ Documents ─────────────────────────────────────────────────────────────
	docs := auth.Group("/documents")
	docs.Use(middleware.RequireRole("educator", "admin"))
	docs.POST("/upload", docH.Upload)
	docs.GET("", docH.ListBySubject)
	docs.GET("/:id", docH.GetByID)
	docs.DELETE("/:id", docH.Delete)

	// Trigger AI processing for a document
	auth.POST("/documents/:id/process", middleware.RequireRole("educator", "admin"), ragH.ProcessDocument)

	// ─ Questions ─────────────────────────────────────────────────────────────
	questions := auth.Group("/questions")
	questions.GET("", middleware.RequireRole("educator", "admin"), questionH.List)
	questions.POST("/bulk", middleware.RequireRole("educator", "admin"), questionH.BulkCreate)
	questions.PATCH("/:id/approve", middleware.RequireRole("educator", "admin"), questionH.Approve)
	questions.POST("/:id/fill-choices", middleware.RequireRole("educator", "admin"), questionH.FillChoices)
	questions.PUT("/:id", middleware.RequireRole("educator", "admin"), questionH.Update)
	questions.DELETE("/:id", middleware.RequireRole("educator", "admin"), questionH.Delete)

	// ─ RAG Generation proxy ──────────────────────────────────────────────────
	auth.POST("/rag/generate", middleware.RequireRole("educator", "admin"), ragH.Generate)

	// ─ Exams ─────────────────────────────────────────────────────────────────
	auth.POST("/exams", middleware.RequireRole("educator", "admin"), examH.Create)
	auth.GET("/exams", examH.List)
	auth.GET("/exams/:id", examH.GetByID)
	auth.GET("/exams/:id/questions", examH.GetQuestions)
	auth.PUT("/exams/:id", middleware.RequireRole("educator", "admin"), examH.Update)
	auth.PATCH("/exams/:id/status", middleware.RequireRole("educator", "admin"), examH.UpdateStatus)
	auth.DELETE("/exams/:id", middleware.RequireRole("educator", "admin"), examH.Delete)

	// ─ Student exam flow ─────────────────────────────────────────────────────
	auth.GET("/student/exams", middleware.RequireRole("student"), examH.ListForStudent)
	auth.POST("/exams/:examID/attempt", middleware.RequireRole("student"), attemptH.StartAttempt)

	attempts := auth.Group("/attempts")
	attempts.GET("/:attemptID", attemptH.GetAttempt)
	attempts.POST("/:attemptID/answers", middleware.RequireRole("student"), attemptH.SaveAnswers)
	attempts.POST("/:attemptID/submit", middleware.RequireRole("student"), attemptH.Submit)

	// ─ Analytics ─────────────────────────────────────────────────────────────
	auth.GET("/analytics/subject/:subjectID", middleware.RequireRole("educator", "admin"), analyticsH.SubjectSummary)
	auth.GET("/analytics/student/:subjectID", middleware.RequireRole("student"), analyticsH.StudentTopics)

	// ─ Admin ─────────────────────────────────────────────────────────────────
	admin := auth.Group("/admin")
	admin.Use(middleware.RequireRole("admin"))
	admin.GET("/users", adminH.ListUsers)
	admin.PATCH("/users/:id/role", adminH.UpdateRole)
	admin.PATCH("/users/:id/deactivate", adminH.Deactivate)

	// ── Health ───────────────────────────────────────────────────────────────
	healthHandler := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	r.GET("/health", healthHandler)
	r.GET("/api/health", healthHandler)

	return r
}
