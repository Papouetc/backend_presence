-- Donnees de test pour la beta. Mots de passe en clair temporairement.

INSERT INTO profiles (matricule, name, surname, email, password, role)
VALUES
  ('PROF001', 'Alice', 'Martin', 'alice.prof@test.local', 'Prof123!', 'prof'),
  ('ETU001', 'Jean', 'Dupont', 'jean.etu@test.local', 'Etudiant123!', 'etudiant'),
  ('ETU002', 'Sarah', 'Bernard', 'sarah.etu@test.local', 'Etudiant123!', 'etudiant'),
  ('ETU003', 'Lucas', 'Moreau', 'lucas.etu@test.local', 'Etudiant123!', 'etudiant'),
  ('ETU004', 'Nina', 'Petit', 'nina.etu@test.local', 'Etudiant123!', 'etudiant')
ON CONFLICT (matricule) DO NOTHING;

INSERT INTO classes (name)
VALUES ('IRT 2')
ON CONFLICT (name) DO NOTHING;

INSERT INTO subjects (name, code)
VALUES ('Programmation C', 'PROG-C')
ON CONFLICT (code) DO NOTHING;

INSERT INTO class_prof (prof_id, class_id)
SELECT p.id, c.id
FROM profiles p
JOIN classes c ON c.name = 'IRT 2'
WHERE p.matricule = 'PROF001'
ON CONFLICT (prof_id, class_id) DO NOTHING;

INSERT INTO subjects_prof (prof_id, subject_id)
SELECT p.id, s.id
FROM profiles p
JOIN subjects s ON s.code = 'PROG-C'
WHERE p.matricule = 'PROF001'
ON CONFLICT (prof_id, subject_id) DO NOTHING;

INSERT INTO class_members (class_id, student_id)
SELECT c.id, p.id
FROM classes c
JOIN profiles p ON p.matricule IN ('ETU001', 'ETU002', 'ETU003', 'ETU004')
WHERE c.name = 'IRT 2'
ON CONFLICT (class_id, student_id) DO NOTHING;