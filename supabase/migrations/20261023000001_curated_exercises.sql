-- =============================================================================
-- Curated exercise catalogue (replaces the API Ninjas import)
--
-- * Adds slug / category / source / is_hidden columns.
-- * Seeds ~211 curated gym exercises (source = 'curated').
-- * Existing workout history is untouched: a legacy (imported) row whose name
--   matches a curated exercise is UPDATED IN PLACE (same id), so every
--   workout_exercises.exercise_id keeps pointing at a valid row. No ids change.
-- * Legacy rows that nobody has logged are hidden (is_hidden = true), never
--   deleted. Legacy rows that ARE in someone's history stay visible.
-- * Custom exercises become private to their creator (RLS).
-- Safe to re-run.
-- =============================================================================

-- 1. Columns ------------------------------------------------------------------
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS search_terms TEXT,
  ADD COLUMN IF NOT EXISTS slug         TEXT,
  ADD COLUMN IF NOT EXISTS category     TEXT,
  ADD COLUMN IF NOT EXISTS source       TEXT,
  ADD COLUMN IF NOT EXISTS is_hidden    BOOLEAN NOT NULL DEFAULT false;

-- 2. Drop any single-column UNIQUE(name) constraint / index -------------------
--    (supabase/add_exercise_library.sql added exercises_name_key out of band.
--     A global unique name blocks private custom exercises that share a name.)
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
      FROM pg_constraint con
     WHERE con.conrelid = 'public.exercises'::regclass
       AND con.contype = 'u'
       AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                WHERE attrelid = 'public.exercises'::regclass
                                  AND attname = 'name')]::smallint[]
  LOOP
    EXECUTE format('ALTER TABLE public.exercises DROP CONSTRAINT %I', c.conname);
  END LOOP;

  FOR c IN
    SELECT i.relname AS idxname
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
     WHERE x.indrelid = 'public.exercises'::regclass
       AND x.indisunique
       AND NOT x.indisprimary
       AND x.indkey::text = (SELECT attnum::text FROM pg_attribute
                              WHERE attrelid = 'public.exercises'::regclass
                                AND attname = 'name')
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = x.indexrelid)
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', c.idxname);
  END LOOP;
END $$;

-- 3. Name key used for matching / duplicate checks ----------------------------
CREATE OR REPLACE FUNCTION public.exercise_name_key(t TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $fn$ SELECT regexp_replace(lower(coalesce(t, '')), '[^a-z0-9]+', '', 'g') $fn$;

-- 4. Source for existing rows ---------------------------------------------------
UPDATE public.exercises
   SET source = CASE WHEN is_custom THEN 'custom' ELSE 'legacy' END
 WHERE source IS NULL;

-- A "custom" row that another user has logged was visible to everyone under the
-- old public-read policy. Make it a shared legacy row so that history survives
-- the stricter policy below.
UPDATE public.exercises e
   SET is_custom = false, source = 'legacy'
 WHERE e.is_custom
   AND EXISTS (
     SELECT 1
       FROM public.workout_exercises we
       JOIN public.workouts w ON w.id = we.workout_id
      WHERE we.exercise_id = e.id
        AND w.user_id IS DISTINCT FROM e.created_by
   );

-- 5. Curated seed ----------------------------------------------------------------
DROP TABLE IF EXISTS pg_temp.curated_seed;
CREATE TEMP TABLE curated_seed (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  category TEXT NOT NULL,
  equipment TEXT,
  search_terms TEXT
);

INSERT INTO curated_seed (slug, name, muscle_group, category, equipment, search_terms) VALUES
  ('barbell-bench-press', 'Barbell Bench Press', 'Chest', 'chest', 'barbell', 'bench press, flat bench, bb bench, flat barbell bench'),
  ('incline-barbell-bench-press', 'Incline Barbell Bench Press', 'Upper Chest', 'chest', 'barbell', 'incline bench, incline bench press, incline barbell press'),
  ('decline-barbell-bench-press', 'Decline Barbell Bench Press', 'Lower Chest', 'chest', 'barbell', 'decline bench, decline bench press'),
  ('dumbbell-bench-press', 'Dumbbell Bench Press', 'Chest', 'chest', 'dumbbell', 'db bench, db bench press, flat dumbbell press, dumbbell press'),
  ('incline-dumbbell-press', 'Incline Dumbbell Press', 'Upper Chest', 'chest', 'dumbbell', 'incline db press, incline dumbbell bench press'),
  ('decline-dumbbell-press', 'Decline Dumbbell Press', 'Lower Chest', 'chest', 'dumbbell', 'decline db press'),
  ('dumbbell-fly', 'Dumbbell Fly', 'Chest', 'chest', 'dumbbell', 'db fly, dumbbell flyes, flat fly, chest fly'),
  ('incline-dumbbell-fly', 'Incline Dumbbell Fly', 'Upper Chest', 'chest', 'dumbbell', 'incline fly, incline db fly'),
  ('pec-deck-fly', 'Pec Deck Fly', 'Chest', 'chest', 'machine', 'pec dec, pec deck, pec dec fly, butterfly, machine fly, chest fly machine, fly machine'),
  ('cable-crossover', 'Cable Crossover', 'Chest', 'chest', 'cable', 'cable fly, cable flyes, standing cable fly, crossover'),
  ('low-to-high-cable-fly', 'Low-to-High Cable Fly', 'Upper Chest', 'chest', 'cable', 'low cable fly, incline cable fly'),
  ('high-to-low-cable-fly', 'High-to-Low Cable Fly', 'Lower Chest', 'chest', 'cable', 'high cable fly, decline cable fly'),
  ('seated-cable-fly', 'Seated Cable Fly', 'Chest', 'chest', 'cable', 'seated cable chest fly'),
  ('cable-chest-press', 'Cable Chest Press', 'Chest', 'chest', 'cable', 'standing cable press'),
  ('machine-chest-press', 'Machine Chest Press', 'Chest', 'chest', 'machine', 'chest press, chest press machine, seated chest press'),
  ('incline-machine-chest-press', 'Incline Machine Chest Press', 'Upper Chest', 'chest', 'machine', 'incline chest press, incline chest press machine'),
  ('plate-loaded-chest-press', 'Plate-Loaded Chest Press', 'Chest', 'chest', 'machine', 'hammer strength chest press, iso lateral chest press, plate loaded chest press'),
  ('smith-machine-bench-press', 'Smith Machine Bench Press', 'Chest', 'chest', 'smith machine', 'smith bench, smith bench press'),
  ('smith-machine-incline-press', 'Smith Machine Incline Press', 'Upper Chest', 'chest', 'smith machine', 'smith incline, smith incline bench'),
  ('barbell-floor-press', 'Barbell Floor Press', 'Chest', 'chest', 'barbell', 'floor press'),
  ('dumbbell-floor-press', 'Dumbbell Floor Press', 'Chest', 'chest', 'dumbbell', 'db floor press'),
  ('dumbbell-squeeze-press', 'Dumbbell Squeeze Press', 'Chest', 'chest', 'dumbbell', 'squeeze press, hex press'),
  ('dumbbell-pullover', 'Dumbbell Pullover', 'Chest', 'chest', 'dumbbell', 'pullover, db pullover'),
  ('svend-press', 'Svend Press', 'Chest', 'chest', 'plate', 'plate press, plate squeeze press'),
  ('push-up', 'Push-Up', 'Chest', 'chest', 'bodyweight', 'pushup, press up, push up'),
  ('incline-push-up', 'Incline Push-Up', 'Lower Chest', 'chest', 'bodyweight', 'incline pushup'),
  ('decline-push-up', 'Decline Push-Up', 'Upper Chest', 'chest', 'bodyweight', 'decline pushup, feet elevated push up'),
  ('weighted-push-up', 'Weighted Push-Up', 'Chest', 'chest', 'bodyweight', 'weighted pushup'),
  ('chest-dip', 'Chest Dip', 'Lower Chest', 'chest', 'bodyweight', 'dips, dip, chest dips, parallel bar dip, weighted dip'),
  ('conventional-deadlift', 'Conventional Deadlift', 'Lower Back', 'back', 'barbell', 'deadlift, dl, barbell deadlift'),
  ('pull-up', 'Pull-Up', 'Lats', 'back', 'bodyweight', 'pullup, pull up, wide grip pull up'),
  ('chin-up', 'Chin-Up', 'Lats', 'back', 'bodyweight', 'chinup, chin up, underhand pull up'),
  ('weighted-pull-up', 'Weighted Pull-Up', 'Lats', 'back', 'bodyweight', 'weighted pullup, weighted chin up'),
  ('assisted-pull-up', 'Assisted Pull-Up', 'Lats', 'back', 'machine', 'assisted pullup, gravitron, assisted chin up, pull up machine'),
  ('lat-pulldown', 'Lat Pulldown', 'Lats', 'back', 'cable', 'pulldown, lat pull down, wide grip pulldown, lat pulldown machine'),
  ('close-grip-lat-pulldown', 'Close-Grip Lat Pulldown', 'Lats', 'back', 'cable', 'close grip pulldown, v bar pulldown, v grip pulldown'),
  ('reverse-grip-lat-pulldown', 'Reverse-Grip Lat Pulldown', 'Lats', 'back', 'cable', 'underhand pulldown, supinated pulldown'),
  ('single-arm-lat-pulldown', 'Single-Arm Lat Pulldown', 'Lats', 'back', 'cable', 'one arm pulldown, single arm pulldown'),
  ('straight-arm-pulldown', 'Straight-Arm Pulldown', 'Lats', 'back', 'cable', 'straight arm pushdown, lat pushdown, cable pullover, rope pullover'),
  ('machine-pullover', 'Machine Pullover', 'Lats', 'back', 'machine', 'nautilus pullover, pullover machine'),
  ('barbell-row', 'Barbell Row', 'Upper Back', 'back', 'barbell', 'bent over row, bb row, bent over barbell row, barbell bent over row'),
  ('pendlay-row', 'Pendlay Row', 'Upper Back', 'back', 'barbell', 'pendlay'),
  ('dumbbell-row', 'Dumbbell Row', 'Lats', 'back', 'dumbbell', 'db row, one arm dumbbell row, single arm dumbbell row, one arm row'),
  ('chest-supported-dumbbell-row', 'Chest-Supported Dumbbell Row', 'Upper Back', 'back', 'dumbbell', 'incline dumbbell row, chest supported row, incline db row'),
  ('seal-row', 'Seal Row', 'Upper Back', 'back', 'barbell', 'bench row'),
  ('t-bar-row', 'T-Bar Row', 'Upper Back', 'back', 'barbell', 'tbar row, t bar, landmine row'),
  ('chest-supported-t-bar-row', 'Chest-Supported T-Bar Row', 'Upper Back', 'back', 'machine', 'supported t bar row, t bar row machine, chest supported t bar'),
  ('meadows-row', 'Meadows Row', 'Lats', 'back', 'barbell', 'landmine single arm row'),
  ('seated-cable-row', 'Seated Cable Row', 'Upper Back', 'back', 'cable', 'cable row, seated row, low row, close grip cable row'),
  ('wide-grip-seated-cable-row', 'Wide-Grip Seated Cable Row', 'Upper Back', 'back', 'cable', 'wide grip cable row, wide cable row'),
  ('single-arm-cable-row', 'Single-Arm Cable Row', 'Lats', 'back', 'cable', 'one arm cable row'),
  ('machine-row', 'Machine Row', 'Upper Back', 'back', 'machine', 'seated row machine, row machine, chest supported machine row'),
  ('plate-loaded-row', 'Plate-Loaded Row', 'Upper Back', 'back', 'machine', 'hammer strength row, iso lateral row, plate loaded row'),
  ('high-row-machine', 'High Row Machine', 'Lats', 'back', 'machine', 'high row, hammer strength high row'),
  ('low-row-machine', 'Low Row Machine', 'Upper Back', 'back', 'machine', 'hammer strength low row'),
  ('inverted-row', 'Inverted Row', 'Upper Back', 'back', 'bodyweight', 'australian pull up, body row'),
  ('rack-pull', 'Rack Pull', 'Lower Back', 'back', 'barbell', 'rack pulls, block pull'),
  ('back-extension', 'Back Extension', 'Lower Back', 'back', 'bodyweight', 'hyperextension, 45 degree back extension, hyper, roman chair back extension'),
  ('superman', 'Superman', 'Lower Back', 'back', 'bodyweight', 'superman hold'),
  ('barbell-shrug', 'Barbell Shrug', 'Traps', 'back', 'barbell', 'shrug, shrugs, bb shrug'),
  ('dumbbell-shrug', 'Dumbbell Shrug', 'Traps', 'back', 'dumbbell', 'db shrug'),
  ('smith-machine-shrug', 'Smith Machine Shrug', 'Traps', 'back', 'smith machine', 'smith shrug'),
  ('trap-bar-shrug', 'Trap Bar Shrug', 'Traps', 'back', 'trap bar', 'hex bar shrug'),
  ('overhead-press', 'Overhead Press', 'Front Delts', 'shoulders', 'barbell', 'ohp, military press, standing press, barbell shoulder press, strict press'),
  ('seated-barbell-shoulder-press', 'Seated Barbell Shoulder Press', 'Front Delts', 'shoulders', 'barbell', 'seated military press, seated ohp'),
  ('dumbbell-shoulder-press', 'Dumbbell Shoulder Press', 'Front Delts', 'shoulders', 'dumbbell', 'db shoulder press, seated dumbbell press, dumbbell overhead press, shoulder press'),
  ('arnold-press', 'Arnold Press', 'Front Delts', 'shoulders', 'dumbbell', 'arnold'),
  ('machine-shoulder-press', 'Machine Shoulder Press', 'Front Delts', 'shoulders', 'machine', 'shoulder press machine, seated shoulder press machine'),
  ('smith-machine-shoulder-press', 'Smith Machine Shoulder Press', 'Front Delts', 'shoulders', 'smith machine', 'smith shoulder press, smith ohp'),
  ('push-press', 'Push Press', 'Front Delts', 'shoulders', 'barbell', 'barbell push press'),
  ('landmine-press', 'Landmine Press', 'Front Delts', 'shoulders', 'barbell', 'single arm landmine press'),
  ('pike-push-up', 'Pike Push-Up', 'Front Delts', 'shoulders', 'bodyweight', 'pike pushup'),
  ('dumbbell-lateral-raise', 'Dumbbell Lateral Raise', 'Side Delts', 'shoulders', 'dumbbell', 'lateral raise, side raise, lat raise, side lateral raise, db lateral raise'),
  ('cable-lateral-raise', 'Cable Lateral Raise', 'Side Delts', 'shoulders', 'cable', 'single arm cable lateral raise, cable side raise'),
  ('machine-lateral-raise', 'Machine Lateral Raise', 'Side Delts', 'shoulders', 'machine', 'lateral raise machine, side raise machine'),
  ('barbell-upright-row', 'Barbell Upright Row', 'Side Delts', 'shoulders', 'barbell', 'upright row'),
  ('cable-upright-row', 'Cable Upright Row', 'Side Delts', 'shoulders', 'cable', 'rope upright row'),
  ('dumbbell-front-raise', 'Dumbbell Front Raise', 'Front Delts', 'shoulders', 'dumbbell', 'front raise, db front raise'),
  ('cable-front-raise', 'Cable Front Raise', 'Front Delts', 'shoulders', 'cable', 'rope front raise'),
  ('plate-front-raise', 'Plate Front Raise', 'Front Delts', 'shoulders', 'plate', 'plate raise'),
  ('rear-delt-fly', 'Rear Delt Fly', 'Rear Delts', 'shoulders', 'dumbbell', 'reverse fly, bent over reverse fly, rear delt raise, db rear delt fly, reverse dumbbell fly'),
  ('reverse-pec-deck', 'Reverse Pec Deck', 'Rear Delts', 'shoulders', 'machine', 'rear delt machine, reverse fly machine, reverse pec dec, rear delt fly machine'),
  ('cable-rear-delt-fly', 'Cable Rear Delt Fly', 'Rear Delts', 'shoulders', 'cable', 'cable reverse fly, reverse cable crossover'),
  ('face-pull', 'Face Pull', 'Rear Delts', 'shoulders', 'cable', 'rope face pull, face pulls'),
  ('band-pull-apart', 'Band Pull-Apart', 'Rear Delts', 'shoulders', 'band', 'pull apart, band pull apart'),
  ('dumbbell-rear-delt-row', 'Dumbbell Rear Delt Row', 'Rear Delts', 'shoulders', 'dumbbell', 'rear delt row'),
  ('barbell-curl', 'Barbell Curl', 'Biceps', 'biceps', 'barbell', 'bb curl, standing barbell curl, straight bar curl'),
  ('ez-bar-curl', 'EZ-Bar Curl', 'Biceps', 'biceps', 'ez bar', 'ez curl, ez bar bicep curl, easy bar curl'),
  ('dumbbell-curl', 'Dumbbell Curl', 'Biceps', 'biceps', 'dumbbell', 'db curl, bicep curl, biceps curl, dumbbell bicep curl, standing dumbbell curl'),
  ('alternating-dumbbell-curl', 'Alternating Dumbbell Curl', 'Biceps', 'biceps', 'dumbbell', 'alternate curl, alternating curl'),
  ('seated-dumbbell-curl', 'Seated Dumbbell Curl', 'Biceps', 'biceps', 'dumbbell', 'seated curl'),
  ('hammer-curl', 'Hammer Curl', 'Brachialis', 'biceps', 'dumbbell', 'db hammer curl, neutral grip curl, dumbbell hammer curl'),
  ('cross-body-hammer-curl', 'Cross-Body Hammer Curl', 'Brachialis', 'biceps', 'dumbbell', 'cross body curl'),
  ('rope-hammer-curl', 'Rope Hammer Curl', 'Brachialis', 'biceps', 'cable', 'cable hammer curl'),
  ('incline-dumbbell-curl', 'Incline Dumbbell Curl', 'Biceps', 'biceps', 'dumbbell', 'incline curl'),
  ('preacher-curl', 'Preacher Curl', 'Biceps', 'biceps', 'ez bar', 'ez bar preacher curl, barbell preacher curl'),
  ('dumbbell-preacher-curl', 'Dumbbell Preacher Curl', 'Biceps', 'biceps', 'dumbbell', 'single arm preacher curl'),
  ('machine-preacher-curl', 'Machine Preacher Curl', 'Biceps', 'biceps', 'machine', 'preacher curl machine, bicep curl machine, machine curl'),
  ('cable-curl', 'Cable Curl', 'Biceps', 'biceps', 'cable', 'cable bicep curl, straight bar cable curl'),
  ('bayesian-cable-curl', 'Bayesian Cable Curl', 'Biceps', 'biceps', 'cable', 'behind the body cable curl, bayesian curl'),
  ('high-cable-curl', 'High Cable Curl', 'Biceps', 'biceps', 'cable', 'overhead cable curl, double biceps cable curl'),
  ('concentration-curl', 'Concentration Curl', 'Biceps', 'biceps', 'dumbbell', 'seated concentration curl'),
  ('spider-curl', 'Spider Curl', 'Biceps', 'biceps', 'dumbbell', 'prone incline curl'),
  ('drag-curl', 'Drag Curl', 'Biceps', 'biceps', 'barbell', 'barbell drag curl'),
  ('close-grip-bench-press', 'Close-Grip Bench Press', 'Triceps', 'triceps', 'barbell', 'cgbp, close grip bench, narrow grip bench press'),
  ('tricep-pushdown', 'Tricep Pushdown', 'Triceps', 'triceps', 'cable', 'triceps pushdown, cable pushdown, straight bar pushdown, pressdown, tricep pressdown, v bar pushdown'),
  ('rope-pushdown', 'Rope Pushdown', 'Triceps', 'triceps', 'cable', 'rope tricep pushdown, rope pressdown, rope triceps extension'),
  ('reverse-grip-pushdown', 'Reverse-Grip Pushdown', 'Triceps', 'triceps', 'cable', 'underhand pushdown, reverse grip tricep pushdown'),
  ('single-arm-cable-pushdown', 'Single-Arm Cable Pushdown', 'Triceps', 'triceps', 'cable', 'one arm pushdown'),
  ('overhead-cable-triceps-extension', 'Overhead Cable Triceps Extension', 'Triceps', 'triceps', 'cable', 'overhead rope extension, cable overhead extension, overhead tricep extension cable'),
  ('overhead-dumbbell-triceps-extension', 'Overhead Dumbbell Triceps Extension', 'Triceps', 'triceps', 'dumbbell', 'dumbbell overhead extension, seated tricep extension, overhead tricep extension'),
  ('skull-crusher', 'Skull Crusher', 'Triceps', 'triceps', 'ez bar', 'skullcrusher, lying tricep extension, ez bar skull crusher, lying triceps extension'),
  ('dumbbell-skull-crusher', 'Dumbbell Skull Crusher', 'Triceps', 'triceps', 'dumbbell', 'lying dumbbell extension, db skull crusher'),
  ('jm-press', 'JM Press', 'Triceps', 'triceps', 'barbell', 'jm'),
  ('triceps-kickback', 'Triceps Kickback', 'Triceps', 'triceps', 'dumbbell', 'dumbbell kickback, tricep kickback'),
  ('cable-triceps-kickback', 'Cable Triceps Kickback', 'Triceps', 'triceps', 'cable', 'cable kickback'),
  ('machine-triceps-extension', 'Machine Triceps Extension', 'Triceps', 'triceps', 'machine', 'tricep machine, triceps extension machine'),
  ('seated-dip-machine', 'Seated Dip Machine', 'Triceps', 'triceps', 'machine', 'dip machine, tricep dip machine'),
  ('assisted-dip', 'Assisted Dip', 'Triceps', 'triceps', 'machine', 'assisted dip machine, assisted dips'),
  ('triceps-dip', 'Triceps Dip', 'Triceps', 'triceps', 'bodyweight', 'tricep dip, bar dip triceps'),
  ('bench-dip', 'Bench Dip', 'Triceps', 'triceps', 'bodyweight', 'bench dips'),
  ('diamond-push-up', 'Diamond Push-Up', 'Triceps', 'triceps', 'bodyweight', 'diamond pushup, close grip push up'),
  ('barbell-wrist-curl', 'Barbell Wrist Curl', 'Forearms', 'forearms', 'barbell', 'wrist curl, wrist curls'),
  ('reverse-wrist-curl', 'Reverse Wrist Curl', 'Forearms', 'forearms', 'barbell', 'wrist extension'),
  ('reverse-curl', 'Reverse Curl', 'Forearms', 'forearms', 'ez bar', 'reverse grip curl, reverse ez curl'),
  ('zottman-curl', 'Zottman Curl', 'Forearms', 'forearms', 'dumbbell', 'zottman'),
  ('farmer-s-carry', 'Farmer''s Carry', 'Forearms', 'forearms', 'dumbbell', 'farmers walk, farmer carry, farmers carry'),
  ('dead-hang', 'Dead Hang', 'Forearms', 'forearms', 'bodyweight', 'bar hang, hang'),
  ('plate-pinch', 'Plate Pinch', 'Forearms', 'forearms', 'plate', 'pinch grip'),
  ('barbell-back-squat', 'Barbell Back Squat', 'Quads', 'legs', 'barbell', 'squat, back squat, bb squat, high bar squat, low bar squat, barbell squat'),
  ('front-squat', 'Front Squat', 'Quads', 'legs', 'barbell', 'barbell front squat'),
  ('goblet-squat', 'Goblet Squat', 'Quads', 'legs', 'dumbbell', 'kettlebell goblet squat, db goblet squat'),
  ('smith-machine-squat', 'Smith Machine Squat', 'Quads', 'legs', 'smith machine', 'smith squat'),
  ('hack-squat', 'Hack Squat', 'Quads', 'legs', 'machine', 'hack squat machine'),
  ('pendulum-squat', 'Pendulum Squat', 'Quads', 'legs', 'machine', 'pendulum'),
  ('belt-squat', 'Belt Squat', 'Quads', 'legs', 'machine', 'belt squat machine'),
  ('v-squat-machine', 'V-Squat Machine', 'Quads', 'legs', 'machine', 'v squat'),
  ('leg-press', 'Leg Press', 'Quads', 'legs', 'machine', 'sled press, 45 degree leg press, leg press machine'),
  ('single-leg-leg-press', 'Single-Leg Leg Press', 'Quads', 'legs', 'machine', 'single leg press, one leg press'),
  ('horizontal-leg-press', 'Horizontal Leg Press', 'Quads', 'legs', 'machine', 'seated leg press'),
  ('leg-extension', 'Leg Extension', 'Quads', 'legs', 'machine', 'quad extension, knee extension, leg extension machine, leg extensions'),
  ('bulgarian-split-squat', 'Bulgarian Split Squat', 'Quads', 'legs', 'dumbbell', 'bss, rear foot elevated split squat, rfess'),
  ('split-squat', 'Split Squat', 'Quads', 'legs', 'dumbbell', 'static lunge'),
  ('walking-lunge', 'Walking Lunge', 'Quads', 'legs', 'dumbbell', 'lunges, lunge, dumbbell lunge, walking lunges'),
  ('reverse-lunge', 'Reverse Lunge', 'Glutes', 'legs', 'dumbbell', 'reverse lunges, dumbbell reverse lunge'),
  ('barbell-lunge', 'Barbell Lunge', 'Quads', 'legs', 'barbell', 'barbell walking lunge'),
  ('step-up', 'Step-Up', 'Quads', 'legs', 'dumbbell', 'box step up, step ups, dumbbell step up'),
  ('sissy-squat', 'Sissy Squat', 'Quads', 'legs', 'bodyweight', 'sissy'),
  ('bodyweight-squat', 'Bodyweight Squat', 'Quads', 'legs', 'bodyweight', 'air squat'),
  ('romanian-deadlift', 'Romanian Deadlift', 'Hamstrings', 'legs', 'barbell', 'rdl, romanian dl, barbell rdl'),
  ('dumbbell-romanian-deadlift', 'Dumbbell Romanian Deadlift', 'Hamstrings', 'legs', 'dumbbell', 'db rdl, dumbbell rdl'),
  ('stiff-leg-deadlift', 'Stiff-Leg Deadlift', 'Hamstrings', 'legs', 'barbell', 'sldl, stiff legged deadlift, straight leg deadlift'),
  ('single-leg-romanian-deadlift', 'Single-Leg Romanian Deadlift', 'Hamstrings', 'legs', 'dumbbell', 'single leg rdl, one leg rdl'),
  ('good-morning', 'Good Morning', 'Hamstrings', 'legs', 'barbell', 'barbell good morning'),
  ('lying-leg-curl', 'Lying Leg Curl', 'Hamstrings', 'legs', 'machine', 'leg curl, hamstring curl, prone leg curl, lying hamstring curl'),
  ('seated-leg-curl', 'Seated Leg Curl', 'Hamstrings', 'legs', 'machine', 'seated hamstring curl'),
  ('standing-leg-curl', 'Standing Leg Curl', 'Hamstrings', 'legs', 'machine', 'single leg curl, standing hamstring curl'),
  ('nordic-hamstring-curl', 'Nordic Hamstring Curl', 'Hamstrings', 'legs', 'bodyweight', 'nordic curl, nordics'),
  ('glute-ham-raise', 'Glute-Ham Raise', 'Hamstrings', 'legs', 'bodyweight', 'ghr'),
  ('sumo-deadlift', 'Sumo Deadlift', 'Glutes', 'legs', 'barbell', 'sumo, sumo dl'),
  ('trap-bar-deadlift', 'Trap Bar Deadlift', 'Glutes', 'legs', 'trap bar', 'hex bar deadlift, trap bar dl'),
  ('hip-thrust', 'Hip Thrust', 'Glutes', 'legs', 'barbell', 'barbell hip thrust, glute thrust, hip thrusts'),
  ('machine-hip-thrust', 'Machine Hip Thrust', 'Glutes', 'legs', 'machine', 'hip thrust machine'),
  ('smith-machine-hip-thrust', 'Smith Machine Hip Thrust', 'Glutes', 'legs', 'smith machine', 'smith hip thrust'),
  ('glute-bridge', 'Glute Bridge', 'Glutes', 'legs', 'barbell', 'barbell glute bridge, bridge'),
  ('cable-pull-through', 'Cable Pull-Through', 'Glutes', 'legs', 'cable', 'pull through, cable pull through'),
  ('cable-glute-kickback', 'Cable Glute Kickback', 'Glutes', 'legs', 'cable', 'glute kickback, donkey kick, cable kickback glute'),
  ('glute-kickback-machine', 'Glute Kickback Machine', 'Glutes', 'legs', 'machine', 'kickback machine'),
  ('reverse-hyperextension', 'Reverse Hyperextension', 'Glutes', 'legs', 'machine', 'reverse hyper'),
  ('kettlebell-swing', 'Kettlebell Swing', 'Glutes', 'legs', 'kettlebell', 'kb swing, swings'),
  ('hip-abduction-machine', 'Hip Abduction Machine', 'Abductors', 'legs', 'machine', 'abductor machine, outer thigh machine, hip abduction, abductors'),
  ('hip-adduction-machine', 'Hip Adduction Machine', 'Adductors', 'legs', 'machine', 'adductor machine, inner thigh machine, hip adduction, adductors'),
  ('cable-hip-abduction', 'Cable Hip Abduction', 'Abductors', 'legs', 'cable', 'standing cable abduction'),
  ('standing-calf-raise', 'Standing Calf Raise', 'Calves', 'legs', 'machine', 'calf raise, standing calf machine, calf raises'),
  ('seated-calf-raise', 'Seated Calf Raise', 'Calves', 'legs', 'machine', 'seated calf machine'),
  ('leg-press-calf-raise', 'Leg Press Calf Raise', 'Calves', 'legs', 'machine', 'calf press, leg press calf press'),
  ('smith-machine-calf-raise', 'Smith Machine Calf Raise', 'Calves', 'legs', 'smith machine', 'smith calf raise'),
  ('single-leg-dumbbell-calf-raise', 'Single-Leg Dumbbell Calf Raise', 'Calves', 'legs', 'dumbbell', 'single leg calf raise, one leg calf raise'),
  ('donkey-calf-raise', 'Donkey Calf Raise', 'Calves', 'legs', 'machine', 'donkey calf'),
  ('tibialis-raise', 'Tibialis Raise', 'Tibialis', 'legs', 'bodyweight', 'tib raise, tibia raise'),
  ('box-jump', 'Box Jump', 'Quads', 'legs', 'bodyweight', 'box jumps'),
  ('crunch', 'Crunch', 'Abs', 'core', 'bodyweight', 'crunches, ab crunch'),
  ('sit-up', 'Sit-Up', 'Abs', 'core', 'bodyweight', 'situp, sit ups'),
  ('decline-crunch', 'Decline Crunch', 'Abs', 'core', 'bodyweight', 'decline sit up, decline bench crunch'),
  ('cable-crunch', 'Cable Crunch', 'Abs', 'core', 'cable', 'kneeling cable crunch, rope crunch'),
  ('machine-crunch', 'Machine Crunch', 'Abs', 'core', 'machine', 'ab crunch machine, ab machine'),
  ('hanging-leg-raise', 'Hanging Leg Raise', 'Abs', 'core', 'bodyweight', 'leg raise, hanging leg raises, straight leg raise'),
  ('hanging-knee-raise', 'Hanging Knee Raise', 'Abs', 'core', 'bodyweight', 'knee raise, knee raises'),
  ('captain-s-chair-leg-raise', 'Captain''s Chair Leg Raise', 'Abs', 'core', 'bodyweight', 'captains chair, vertical knee raise, roman chair leg raise'),
  ('lying-leg-raise', 'Lying Leg Raise', 'Abs', 'core', 'bodyweight', 'floor leg raise'),
  ('toes-to-bar', 'Toes-to-Bar', 'Abs', 'core', 'bodyweight', 'toes to bar, ttb'),
  ('v-up', 'V-Up', 'Abs', 'core', 'bodyweight', 'v ups, v sit'),
  ('ab-wheel-rollout', 'Ab Wheel Rollout', 'Abs', 'core', 'ab wheel', 'ab roller, rollout, ab rollout'),
  ('plank', 'Plank', 'Abs', 'core', 'bodyweight', 'front plank, forearm plank'),
  ('side-plank', 'Side Plank', 'Obliques', 'core', 'bodyweight', 'side planks'),
  ('dead-bug', 'Dead Bug', 'Abs', 'core', 'bodyweight', 'deadbug'),
  ('hollow-hold', 'Hollow Hold', 'Abs', 'core', 'bodyweight', 'hollow body hold'),
  ('mountain-climber', 'Mountain Climber', 'Abs', 'core', 'bodyweight', 'mountain climbers'),
  ('russian-twist', 'Russian Twist', 'Obliques', 'core', 'bodyweight', 'russian twists, seated twist'),
  ('bicycle-crunch', 'Bicycle Crunch', 'Obliques', 'core', 'bodyweight', 'bicycle crunches, bicycles'),
  ('cable-woodchopper', 'Cable Woodchopper', 'Obliques', 'core', 'cable', 'wood chop, woodchop, cable chop'),
  ('pallof-press', 'Pallof Press', 'Obliques', 'core', 'cable', 'anti rotation press'),
  ('dumbbell-side-bend', 'Dumbbell Side Bend', 'Obliques', 'core', 'dumbbell', 'side bend, oblique side bend'),
  ('power-clean', 'Power Clean', 'Full Body', 'full_body', 'barbell', 'clean, power cleans'),
  ('hang-clean', 'Hang Clean', 'Full Body', 'full_body', 'barbell', 'hang power clean'),
  ('clean-and-jerk', 'Clean and Jerk', 'Full Body', 'full_body', 'barbell', 'clean & jerk, c&j'),
  ('snatch', 'Snatch', 'Full Body', 'full_body', 'barbell', 'power snatch'),
  ('thruster', 'Thruster', 'Full Body', 'full_body', 'barbell', 'barbell thruster, dumbbell thruster'),
  ('burpee', 'Burpee', 'Full Body', 'full_body', 'bodyweight', 'burpees'),
  ('sled-push', 'Sled Push', 'Full Body', 'full_body', 'machine', 'prowler push, sled'),
  ('battle-ropes', 'Battle Ropes', 'Full Body', 'full_body', 'rope', 'battle rope');

-- 5a. Rows already curated (re-run): refresh in place.
UPDATE public.exercises e
   SET name = s.name, muscle_group = s.muscle_group, category = s.category,
       equipment = s.equipment, search_terms = s.search_terms,
       source = 'curated', is_custom = false, is_hidden = false
  FROM curated_seed s
 WHERE e.slug = s.slug;

-- 5b. Adopt legacy rows whose NAME matches (most-logged row wins), then rows
--     whose name matches an ALIAS. Same id, so history keeps working.
DO $$
DECLARE
  s RECORD;
  target UUID;
  pass INT;
BEGIN
  FOR pass IN 1..2 LOOP
    FOR s IN
      SELECT * FROM curated_seed cs
       WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.slug = cs.slug)
       ORDER BY cs.slug
    LOOP
      SELECT e.id INTO target
        FROM public.exercises e
       WHERE e.source = 'legacy'
         AND e.slug IS NULL
         AND (
           (pass = 1 AND public.exercise_name_key(e.name) = public.exercise_name_key(s.name))
           OR (pass = 2 AND public.exercise_name_key(e.name) IN (
                 SELECT public.exercise_name_key(a)
                   FROM unnest(string_to_array(s.search_terms, ',')) AS a
                  WHERE btrim(a) <> ''))
         )
       ORDER BY (SELECT count(*) FROM public.workout_exercises we WHERE we.exercise_id = e.id) DESC,
                e.created_at, e.id
       LIMIT 1;

      IF target IS NOT NULL THEN
        UPDATE public.exercises
           SET slug = s.slug, name = s.name, muscle_group = s.muscle_group,
               category = s.category, equipment = s.equipment,
               search_terms = s.search_terms, source = 'curated',
               is_custom = false, is_hidden = false
         WHERE id = target;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 5c. Insert whatever is still missing.
INSERT INTO public.exercises
  (slug, name, muscle_group, category, equipment, search_terms, is_custom, source, is_hidden, created_by)
SELECT s.slug, s.name, s.muscle_group, s.category, s.equipment, s.search_terms,
       false, 'curated', false, NULL
  FROM curated_seed s
 WHERE NOT EXISTS (SELECT 1 FROM public.exercises e WHERE e.slug = s.slug);

DROP TABLE IF EXISTS pg_temp.curated_seed;

-- 6. Category for legacy + custom rows (API Ninjas / old picker muscle labels) --
UPDATE public.exercises
   SET category = CASE lower(muscle_group)
       WHEN 'chest' THEN 'chest'
       WHEN 'lats' THEN 'back'
       WHEN 'middle back' THEN 'back'
       WHEN 'lower back' THEN 'back'
       WHEN 'traps' THEN 'back'
       WHEN 'shoulders' THEN 'shoulders'
       WHEN 'neck' THEN 'shoulders'
       WHEN 'biceps' THEN 'biceps'
       WHEN 'triceps' THEN 'triceps'
       WHEN 'forearms' THEN 'forearms'
       WHEN 'quadriceps' THEN 'legs'
       WHEN 'hamstrings' THEN 'legs'
       WHEN 'glutes' THEN 'legs'
       WHEN 'calves' THEN 'legs'
       WHEN 'abductors' THEN 'legs'
       WHEN 'adductors' THEN 'legs'
       WHEN 'abdominals' THEN 'core'
       ELSE 'other'
     END
 WHERE source IN ('legacy', 'custom')
   AND category IS NULL;

-- 7. Hide legacy rows nobody has logged. Never delete: ids stay valid. ----------
UPDATE public.exercises e
   SET is_hidden = true
 WHERE e.source = 'legacy'
   AND NOT EXISTS (SELECT 1 FROM public.workout_exercises we WHERE we.exercise_id = e.id);

-- 8. Indexes -------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS exercises_slug_key
  ON public.exercises (slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exercises_visible
  ON public.exercises (is_hidden, category);

-- One custom exercise per (user, name key). Only created when current data allows it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.exercises
     WHERE is_custom
     GROUP BY created_by, public.exercise_name_key(name)
    HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS exercises_custom_owner_name_key
      ON public.exercises (created_by, public.exercise_name_key(name))
      WHERE is_custom;
  END IF;
END $$;

-- 9. RLS: shared catalogue readable by all, custom rows private ----------------
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'exercises'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.exercises', p.policyname);
  END LOOP;
END $$;

-- Hidden legacy rows stay SELECT-able on purpose: History embeds exercises(name)
-- and would drop rows it cannot read. The app filters is_hidden itself.
CREATE POLICY "exercises: read shared or own"
  ON public.exercises FOR SELECT
  USING (is_custom = false OR created_by = auth.uid());

CREATE POLICY "exercises: owner insert custom"
  ON public.exercises FOR INSERT
  WITH CHECK (is_custom = true AND created_by = auth.uid() AND slug IS NULL);

CREATE POLICY "exercises: owner update custom"
  ON public.exercises FOR UPDATE
  USING (is_custom = true AND created_by = auth.uid())
  WITH CHECK (is_custom = true AND created_by = auth.uid() AND slug IS NULL);

CREATE POLICY "exercises: owner delete custom"
  ON public.exercises FOR DELETE
  USING (is_custom = true AND created_by = auth.uid());
