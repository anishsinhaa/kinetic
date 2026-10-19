-- Alias search for the exercise library: "back squat" should find "Barbell Squat",
-- "rdl" should find "Romanian Deadlift". search_terms is a comma-separated alias
-- list that the app matches (ILIKE) alongside `name`.
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS search_terms TEXT;

-- Append aliases to matching library rows. Re-running is a no-op: an alias is only
-- appended when it is not already present.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('bench press',                         'incline|decline|dumbbell|close|reverse', 'flat bench, chest press, bb bench'),
      ('overhead press|shoulder press|military press', '',                              'ohp, standing press'),
      ('deadlift',                            'romanian|stiff|sumo|single|dumbbell|deficit', 'dl, conventional deadlift'),
      ('romanian deadlift',                   '',                                        'rdl, stiff leg deadlift'),
      ('squat',                               'split|hack|goblet|front|jump|overhead|bulgarian|pistol', 'back squat, barbell squat'),
      ('pull.?up',                            'assisted|negative|wide|close',            'pullup, chin up'),
      ('chin.?up',                            '',                                        'chinup, pull up'),
      ('lat pull.?down',                      '',                                        'lat pull down, pulldown'),
      ('barbell row|bent.?over row',          '',                                        'bb row, bent over row'),
      ('tricep?s? push.?down',                '',                                        'pushdown, tricep pressdown'),
      ('bicep?s? curl',                       '',                                        'curl, arm curl'),
      ('leg press',                           '',                                        'sled press'),
      ('\mdips?\M',                           'hip',                                     'dips, chest dip, tricep dip'),
      ('lateral raise',                       '',                                        'side raise, side delt raise'),
      ('face pull',                           '',                                        'rear delt pull, rope face pull'),
      ('hip thrust',                          '',                                        'glute bridge, glute thrust'),
      ('push.?up',                            '',                                        'pushup, press up')
    ) AS t(pattern, exclude, term)
  LOOP
    UPDATE public.exercises e
       SET search_terms = CASE
             WHEN coalesce(e.search_terms, '') = '' THEN r.term
             ELSE e.search_terms || ', ' || r.term
           END
     WHERE e.is_custom = false
       AND e.name ~* r.pattern
       AND (r.exclude = '' OR e.name !~* r.exclude)
       AND coalesce(e.search_terms, '') NOT ILIKE '%' || r.term || '%';
  END LOOP;
END $$;

-- Common lifts that a library import may not contain. Only added when no similar
-- exercise exists, so this never duplicates imported rows.
INSERT INTO public.exercises (name, muscle_group, equipment, is_custom, search_terms)
SELECT v.name, v.muscle_group, v.equipment, false, v.search_terms
  FROM (VALUES
    ('Barbell Back Squat',    'Quadriceps', 'barbell', '\msquat',           'back squat, squat, barbell squat'),
    ('Barbell Bench Press',   'Chest',      'barbell', 'bench press',       'bench, flat bench, chest press'),
    ('Conventional Deadlift', 'Lower Back', 'barbell', 'deadlift',          'deadlift, dl'),
    ('Overhead Press',        'Shoulders',  'barbell', 'overhead press|shoulder press|military press', 'ohp, shoulder press, press'),
    ('Lat Pulldown',          'Lats',       'cable',   'pull.?down',        'lat pull down, pulldown'),
    ('Pull-Up',               'Lats',       'bodyweight', 'pull.?up',       'pullup, pull up, chin up')
  ) AS v(name, muscle_group, equipment, exists_pattern, search_terms)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.exercises e WHERE e.name ~* v.exists_pattern
 );
