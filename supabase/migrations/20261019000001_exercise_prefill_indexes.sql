-- Speed last-session / PR lookups when adding an exercise to a workout
CREATE INDEX IF NOT EXISTS idx_workout_exercises_exercise
  ON public.workout_exercises (exercise_id);

CREATE INDEX IF NOT EXISTS idx_workouts_user_ended
  ON public.workouts (user_id, ended_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_sets_we_completed
  ON public.sets (workout_exercise_id)
  WHERE completed_at IS NOT NULL;
