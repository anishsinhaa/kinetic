-- Real "last saved" timestamp for recovery check-ins
ALTER TABLE public.body_feedback
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.body_feedback
SET updated_at = created_at
WHERE updated_at IS NULL OR updated_at < created_at;

DROP TRIGGER IF EXISTS body_feedback_updated_at ON public.body_feedback;
CREATE TRIGGER body_feedback_updated_at
  BEFORE UPDATE ON public.body_feedback
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
