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

	// â”€â”€ CORS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

	// â”€â”€ Repositories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	userRepo := repository.NewUserRepo(db)
	subjectRepo := repository.NewSubjectRepo(db)
	docRepo := repository.NewDocumentRepo(db)
	questionRepo := repository.NewQuestionRepo(db)
	examRepo := repository.NewExamRepo(db)
	attemptRepo := repository.NewAttemptRepo(db)
	analyticsRepo := repository.NewAnalyticsRepo(db)

	// â”€â”€ Services â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	scorer := services.NewScoringService(attemptRepo, examRepo, questionRepo, cfg.AIServiceURL)

	// â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	authH := handlers.NewAuthHandler(userRepo, cfg)
	subjectH := handlers.NewSubjectHandler(subjectRepo, userRepo)
	docH := handlers.NewDocumentHandler(docRepo, cfg)
	questionH := handlers.NewQuestionHandler(questionRepo, cfg)
	examH := handlers.NewExamHandler(examRepo)
	attemptH := handlers.NewAttemptHandler(attemptRepo, scorer)
	analyticsH := handlers.NewAnalyticsHandler(analyticsRepo)
	ragH := handlers.NewRAGProxyHandler(cfg)
	adminH := handlers.NewAdminHandler(userRepo)

	// Serve uploaded files (question images, etc.)
	r.Static("/uploads", cfg.UploadsDir)

	api := r.Group("/api")

	// â”€â”€ Public â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	api.POST("/auth/login", authH.Login)
	api.POST("/auth/register", authH.Register)
	api.POST("/auth/logout", authH.Logout)

	// â”€â”€ Authenticated â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	auth := api.Group("/")
	auth.Use(middleware.RequireAuth(cfg.JWTSecret))

	auth.GET("/auth/me", authH.Me)

	// â”€ Subjects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	auth.POST("/subjects", middleware.RequireRole("educator", "admin"), subjectH.Create)
	auth.GET("/subjects", middleware.RequireRole("educator", "admin"), subjectH.List)
	auth.GET("/subjects/:id", subjectH.GetByID)
	auth.POST("/subjects/:id/enroll", middleware.RequireRole("educator", "admin"), subjectH.Enroll)
	auth.DELETE("/subjects/:id", middleware.RequireRole("educator", "admin"), subjectH.Delete)
	auth.GET("/subjects/my", middleware.RequireRole("student"), subjectH.ListForStudent)

	// â”€ Documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	docs := auth.Group("/documents")
	docs.Use(middleware.RequireRole("educator", "admin"))
	docs.POST("/upload", docH.Upload)
	docs.GET("", docH.ListBySubject)
	docs.GET("/:id", docH.GetByID)
	docs.DELETE("/:id", docH.Delete)

	// Trigger AI processing for a document
	auth.POST("/documents/:id/process", middleware.RequireRole("educator", "admin"), ragH.ProcessDocument)

	// â”€ Questions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	questions := auth.Group("/questions")
	questions.GET("", middleware.RequireRole("educator", "admin"), questionH.List)
	questions.POST("/bulk", middleware.RequireRole("educator", "admin"), questionH.BulkCreate)
	questions.PATCH("/:id/approve", middleware.RequireRole("educator", "admin"), questionH.Approve)
	questions.POST("/:id/fill-choices", middleware.RequireRole("educator", "admin"), questionH.FillChoices)
	questions.PUT("/:id", middleware.RequireRole("educator", "admin"), questionH.Update)
	questions.DELETE("/:id", middleware.RequireRole("educator", "admin"), questionH.Delete)
	questions.POST("/:id/image", middleware.RequireRole("educator", "admin"), questionH.UploadImage)
	questions.DELETE("/:id/image", middleware.RequireRole("educator", "admin"), questionH.RemoveImage)

	// â”€ RAG Generation proxy â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	auth.POST("/rag/generate", middleware.RequireRole("educator", "admin"), ragH.Generate)

	// â”€ Exams â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	auth.POST("/exams", middleware.RequireRole("educator", "admin"), examH.Create)
	auth.GET("/exams", examH.List)
	auth.GET("/exams/:id", examH.GetByID)
	auth.GET("/exams/:id/questions", examH.GetQuestions)
	auth.PUT("/exams/:id", middleware.RequireRole("educator", "admin"), examH.Update)
	auth.PATCH("/exams/:id/status", middleware.RequireRole("educator", "admin"), examH.UpdateStatus)
	auth.PATCH("/exams/:id/questions", middleware.RequireRole("educator", "admin"), examH.ReplaceQuestion)
	auth.PATCH("/exams/:id/questions/:questionId/points", middleware.RequireRole("educator", "admin"), examH.UpdateQuestionPoints)
	auth.DELETE("/exams/:id", middleware.RequireRole("educator", "admin"), examH.Delete)

	// â”€ Student exam flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	auth.GET("/student/exams", middleware.RequireRole("student"), examH.ListForStudent)
	auth.POST("/exams/:examID/attempt", middleware.RequireRole("student"), attemptH.StartAttempt)

	attempts := auth.Group("/attempts")
	attempts.GET("/:attemptID", attemptH.GetAttempt)
	attempts.POST("/:attemptID/answers", middleware.RequireRole("student"), attemptH.SaveAnswers)
	attempts.POST("/:attemptID/submit", middleware.RequireRole("student"), attemptH.Submit)

	// â”€ Analytics â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	auth.GET("/analytics/subject/:subjectID", middleware.RequireRole("educator", "admin"), analyticsH.SubjectSummary)
	auth.GET("/analytics/student/:subjectID", middleware.RequireRole("student"), analyticsH.StudentTopics)

	// â”€ Admin â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	admin := auth.Group("/admin")
	admin.Use(middleware.RequireRole("admin"))
	admin.GET("/users", adminH.ListUsers)
	admin.PATCH("/users/:id/role", adminH.UpdateRole)
	admin.PATCH("/users/:id/deactivate", adminH.Deactivate)

	// â”€â”€ Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
	healthHandler := func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	}
	r.GET("/health", healthHandler)
	r.GET("/api/health", healthHandler)

	return r
}
