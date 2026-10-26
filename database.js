import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

export async function initDatabase() {
    await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      matricule TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      surname TEXT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('prof', 'etudiant')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

        ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
        ALTER TABLE profiles
            ADD CONSTRAINT profiles_role_check CHECK (role IN ('prof', 'etudiant', 'admin'));

        CREATE TABLE IF NOT EXISTS matricule_counters (
            role TEXT PRIMARY KEY CHECK (role IN ('prof', 'etudiant', 'admin')),
            last_index BIGINT NOT NULL DEFAULT 0 CHECK (last_index >= 0)
        );

    CREATE TABLE IF NOT EXISTS classes (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE
    );

        CREATE TABLE IF NOT EXISTS classes_prof (
            prof_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
            PRIMARY KEY (prof_id, class_id)
        );

        CREATE TABLE IF NOT EXISTS subjects_prof (
            prof_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
            subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
            PRIMARY KEY (prof_id, subject_id)
        );

    CREATE TABLE IF NOT EXISTS class_members (
      class_id BIGINT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      PRIMARY KEY (class_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      professor_id UUID NOT NULL REFERENCES profiles(id),
      class_id BIGINT NOT NULL REFERENCES classes(id),
      subject_id BIGINT NOT NULL REFERENCES subjects(id),
      qr_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      qr_expires_at TIMESTAMPTZ NOT NULL,
      manually_closed BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS attendances (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id UUID NOT NULL REFERENCES profiles(id),
      scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL CHECK (status IN ('present', 'retard', 'absent')),
      UNIQUE (session_id, student_id)
    );
  `);

    console.log('Base de données initialisée');
}

export async function closeDatabase() {
    await pool.end();
}

export async function findProfile(identifier) {
    const result = await pool.query(
        `SELECT * FROM profiles
     WHERE id::text = $1 OR matricule = $1 OR email = $1
     LIMIT 1`,
        [String(identifier)]
    );
    return result.rows[0] || null;
}

async function buildProfessorProfile(profile) {
    const [classesResult, subjectsResult] = await Promise.all([
        pool.query(
            `SELECT c.id, c.name
         FROM classes_prof cp
         JOIN classes c ON c.id = cp.class_id
         WHERE cp.prof_id = $1
         ORDER BY c.name`,
            [profile.id]
        ),
        pool.query(
            `SELECT s.id, s.name, s.code
         FROM subjects_prof sp
         JOIN subjects s ON s.id = sp.subject_id
         WHERE sp.prof_id = $1
         ORDER BY s.name`,
            [profile.id]
        )
    ]);

    return {
        role: 'prof',
        matricule: profile.matricule,
        name: profile.name,
        surname: profile.surname,
        classes: classesResult.rows.map(row => row.name),
        modules: subjectsResult.rows.map(row => row.name)
    };
}

async function buildStudentProfile(profile) {
    const classResult = await pool.query(
        `SELECT c.name AS classe
         FROM class_members cm
         JOIN classes c ON c.id = cm.class_id
         WHERE cm.student_id = $1
         ORDER BY c.name ASC
         LIMIT 1`,
        [profile.id]
    );

    const studentClass = classResult.rows[0]?.classe || null;

    let module = null;
    if (studentClass) {
        const moduleResult = await pool.query(
            `SELECT DISTINCT s.name AS module
             FROM classes_prof cp
             JOIN subjects_prof sp ON sp.prof_id = cp.prof_id
             JOIN subjects s ON s.id = sp.subject_id
             JOIN classes c ON c.id = cp.class_id
             WHERE c.name = $1
             ORDER BY s.name ASC
             LIMIT 1`,
            [studentClass]
        );
        module = moduleResult.rows[0]?.module || null;
    }

    if (!profile.matricule || !profile.name || !profile.surname || !studentClass || !module) {
        return null;
    }

    return {
        role: 'etudiant',
        matricule: profile.matricule,
        name: profile.name,
        surname: profile.surname,
        classe: studentClass,
        module
    };
}

async function buildAdminProfile(profile) {

    return {
        role: 'admin',
        matricule: profile.matricule,
        name: profile.name,
        surname: profile.surname
    };
}

export async function authenticateProfile(matricule, password) {
    const normalizedMatricule = String(matricule || '').trim();
    const normalizedPassword = String(password || '');

    if (!normalizedMatricule || !normalizedPassword) {
        return null;
    }

    const result = await pool.query(
        `SELECT id, matricule, name, surname, email, password, role, created_at
     FROM profiles
     WHERE matricule = $1
     LIMIT 1`,
        [normalizedMatricule]
    );

    const profile = result.rows[0];
    if (!profile) return null;
    if (profile.password !== normalizedPassword) return null;

    if (profile.role === 'prof') return buildProfessorProfile(profile);
    if (profile.role === 'etudiant') return buildStudentProfile(profile);
    if (profile.role === 'admin') return buildAdminProfile(profile);

    return null;
}

async function createMatricule(role) {
    const prefixes = {
        admin: 'ADM',
        etudiant: 'ETU',
        prof: 'PROF'
    };
    const prefix = prefixes[role];

    if (!prefix) {
        throw new Error(`Rôle invalide pour la génération du matricule : ${role}`);
    }

    const result = await pool.query(
        `INSERT INTO matricule_counters (role, last_index)
         SELECT $1, COALESCE(MAX(substring(matricule FROM '[0-9]+$')::BIGINT), 0) + 1
         FROM profiles
         WHERE role = $1 AND matricule ~ ('^' || $2 || '[0-9]+$')
         ON CONFLICT (role) DO UPDATE
         SET last_index = GREATEST(matricule_counters.last_index, EXCLUDED.last_index - 1) + 1
         RETURNING last_index`,
        [role, prefix]
    );

    return `${prefix}${String(result.rows[0].last_index).padStart(3, '0')}`;
}

export async function addUser({ role, nom, prenom, email, password }) {
    try {
        const matricule = await createMatricule(role);
        const result = await pool.query(
            `INSERT INTO profiles (matricule, name, surname, email, password, role)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, matricule, name, surname, email, role, created_at`,
            [matricule, prenom, nom, email, password, role]
        );
    
        return result.rows[0];
    } catch (error) {
        console.error(error);
        return null
    }
}
async function getOrCreateByName(table, name) {
    const result = await pool.query(
        `INSERT INTO ${table} (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id, name`,
        [name]
    );
    return result.rows[0];
}

export async function createAttendanceSession({ professor, classe, matiere, dureeMinutes }) {
    const professorProfile = await findProfile(professor);
    if (!professorProfile) {
        console.log(`prof introuvable  id: ${professor} classe: ${classe} matiere: ${matiere}`);

        return { error: 'professeur introuvable' }
    };

    const classRow = await getOrCreateByName('classes', classe);
    const subjectRow = await getOrCreateByName('subjects', matiere);
    const existing = await pool.query(
        `SELECT * FROM attendance_sessions
     WHERE professor_id = $1
       AND manually_closed = FALSE
       AND qr_expires_at > now()
     LIMIT 1`,
        [professorProfile.id]
    );
    if (existing.rows[0]) return { existing: existing.rows[0] };

    const result = await pool.query(
        `INSERT INTO attendance_sessions
     (professor_id, class_id, subject_id, qr_expires_at)
     VALUES ($1, $2, $3, now() + ($4 * interval '1 minute'))
     RETURNING *`,
        [professorProfile.id, classRow.id, subjectRow.id, dureeMinutes]
    );
    return { session: result.rows[0] };
}

export async function getSessionById(id) {
    const result = await pool.query(
        `SELECT s.*, c.name AS classe, sub.name AS matiere,
        p.matricule AS prof
     FROM attendance_sessions s
     JOIN classes c ON c.id = s.class_id
     JOIN subjects sub ON sub.id = s.subject_id
     JOIN profiles p ON p.id = s.professor_id
     WHERE s.id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

export async function getSessionByQrToken(qrToken) {
    const result = await pool.query(
        `SELECT s.*, c.name AS classe, sub.name AS matiere,
        p.matricule AS prof
     FROM attendance_sessions s
     JOIN classes c ON c.id = s.class_id
     JOIN subjects sub ON sub.id = s.subject_id
     JOIN profiles p ON p.id = s.professor_id
     WHERE s.qr_token = $1`,
        [qrToken]
    );
    return result.rows[0] || null;
}

export async function createAttendance({ sessionId, matricule, name, surname }) {
    const student = await findProfile(matricule);
    if (!student) return { error: 'etudiant introuvable' };

    const session = await getSessionById(sessionId);
    if (!session) return { error: 'session inexistante' };

    const membership = await pool.query(
        `SELECT 1 FROM class_members WHERE class_id = $1 AND student_id = $2`,
        [session.class_id, student.id]
    );
    if (membership.rows.length === 0) return { error: 'classe_invalide' };

    const status = Date.now() - new Date(session.started_at).getTime() > 5 * 60000
        ? 'retard'
        : 'present';
    try {
        const result = await pool.query(
            `INSERT INTO attendances (session_id, student_id, scanned_at, status)
       VALUES ($1, $2, now(), $3)
       RETURNING id, scanned_at AS date, status AS statut`,
            [sessionId, student.id, status]
        );
        return { attendance: { ...result.rows[0], matricule, name: name || student.name, surname: surname || student.surname } };
    } catch (error) {
        if (error.code === '23505') return { error: 'deja_scane' };
        throw error;
    }
}

export async function updateAttendanceStatus(sessionId, matricule, status) {
    const result = await pool.query(
        `UPDATE attendances a SET status = $3
     FROM profiles p
     WHERE a.student_id = p.id AND a.session_id = $1 AND p.matricule = $2
     RETURNING a.id, a.session_id, p.matricule, a.status AS statut`,
        [sessionId, matricule, status]
    );
    return result.rows[0] || null;
}

export async function listAttendances(sessionId) {
    const result = await pool.query(
        `SELECT a.id, a.session_id, p.matricule, p.name, p.surname,
        a.scanned_at AS date, a.status AS statut
     FROM attendances a
     JOIN profiles p ON p.id = a.student_id
     WHERE a.session_id = $1
     ORDER BY a.scanned_at ASC`,
        [sessionId]
    );
    return result.rows;
}

export async function closeAttendanceSession(id) {
    const result = await pool.query(
        `UPDATE attendance_sessions
     SET manually_closed = TRUE
     WHERE id = $1 AND manually_closed = FALSE AND qr_expires_at > now()
     RETURNING *`,
        [id]
    );
    return result.rows[0] || null;
}

export async function getStats(){
    const result = await pool.query(`
        SELECT 
        COUNT(*) FILTER (WHERE p.role = 'prof') AS nbProfs,
        COUNT(*) FILTER (WHERE p.role = 'etudiant') AS nbEtudiants,
        COUNT(*) FILTER (WHERE p.role = 'admin') AS nbadmins,
        (SELECT COUNT(*) FROM classes) AS nbclasses
        FROM profiles p
        `)
   return result.rows[0]
}
/* function count(list) {
    let nbProf= list.filter(n=> n.role =='prof').length
    let nbEtu= list.filter(n=> n.role =='etudiant').length
    let nbAdmin= list.filter(n=> n.role =='admin').length
    let nbr= {
        'prof': nbProf,
        'etu': nbEtu,
        'adm': nbAdmin
    }
    return nbr
} */