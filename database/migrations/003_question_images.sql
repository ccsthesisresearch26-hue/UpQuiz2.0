-- Add image_url column to generated_questions for optional context images
ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS image_url TEXT;
