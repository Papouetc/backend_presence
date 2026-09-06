import express from 'express';
import cors from 'cors';
import {
    initDatabase,
    authenticateProfile,
    createAttendance,
    createAttendanceSession,
    getSessionById,
    getSessionByQrToken,
    updateAttendanceStatus,
    listAttendances,
    closeAttendanceSession
} from './database.js';
//const { json } = require('stream/consumers');
//const attendance= require('./routes/attendance')




const app = express()

//app.use(attendance);
app.use(cors());
app.use(express.json())

function getStatus(session) {
    return !session.manually_closed && new Date(session.qr_expires_at).getTime() > Date.now();
}

async function formatSession(session) {
    return {
        id: session.id,
        classe: session.classe,
        prof: session.prof,
        matiere: session.matiere,
        date: session.started_at,
        qrToken: session.qr_token,
        qrExpireAt: session.qr_expires_at,
        clotureeManuellement: session.manually_closed,
        presences: await listAttendances(session.id)
    };
}

app.get('/', (req, res) => {
    console.log("get");
    res.send("Page d'acceuil");
})
//// PRESENCE
app.post('/presence/statut/manuel', async (req, res) => {
    const data = req.body;
    const student = await updateAttendanceStatus(data.id, data.matricule, data.statut);
    if (!student) {
        return res.status(404).send("présence non trouvée");
    }
    res.status(200).send(student);
});

app.post('/presence/scan', async (req, res) => {
    if (!req.body.matricule || !req.body.qrToken) {
        return res.status(400).send("Données invalides");
    }
    const data = req.body;
    const session = await getSessionByQrToken(data.qrToken);
    if (!session) {
        return res.status(404).send("session inexistante");
    }
    if (!getStatus(session)) {
        return res.status(400).send("Session expirée ou invalide");
    }
    if (session.classe !== data.classe) {
        return res.status(403).send("Vous ne faites pas partie de cette classe");
    }
    const result = await createAttendance({
        sessionId: session.id,
        matricule: data.matricule,
        name: data.name,
        surname: data.surname
    });
    if (result.error === 'etudiant introuvable') return res.status(404).send(result.error);
    if (result.error === 'classe_invalide') return res.status(403).send("Vous ne faites pas partie de cette classe");
    if (result.error === 'deja_scane') return res.status(409).send("Vous avez deja scanné pour cette session");
    res.status(200).send(result.attendance);
});

/*
app.post('/presence/scan-json', (req, res) => {
    const data = req.body;
    if (!session) {
        return res.status(404).send("session non trouvé")
    }
    const student = session.presences.find(q => q.matricule == data.matricule);
    if (!student) {
        return res.status(404).send("etudiant non trouvé")
    }
    student.statut = statut;
    fs.writeFileSync("src/session.json", JSON.stringify(sessions), (err) => {
        if (err) console.log(err);
    })
    res.status(200).send(student)
});
*/

/* app.post('/presence/scan', (req,res)=>{
    if (!req.body.student_id || !req.body.session_id) {
        res.status(400).send("Données invalides")
    }
    
     const dataa= req.body;
    const exist = session.find(e=>
        e.id==dataa.id
    )
    console.log(exist);
     
 

    const data= {
        ...req.body,
        date: new Date()
    }
    fs.writeFile("src/attendance.json",JSON.stringify(data),(err) => {
    console.log(err);
})
res.status(200).send("Données reçu !")
}); */

////////SESSIONS
app.post('/session', async (req, res) => {
    const data = req.body;
    console.log(`
            demande de session, info: ${JSON.stringify(data,null,2)}
        `);
    
    const result = await createAttendanceSession({
        professor: data.prof,
        classe: data.classe,
        matiere: data.matiere,
        dureeMinutes: data.duree || 15
    });
    if (result.error) return res.status(422).send("Erreur creation de session");
    if (result.existing) return res.status(409).send(await formatSession(await getSessionById(result.existing.id)));
    res.status(200).send(await formatSession(await getSessionById(result.session.id)));
});

app.post('/session/stop', async (req, res) => {
    const data = req.body;
    const session = await getSessionById(data.id);
    if (!session) {
        return res.status(404).send("session non trouvé")
    }
    if (!getStatus(session)) {
        return res.status(404).send("session expiré ou deja cloturée")
    }
    const closedSession = await closeAttendanceSession(data.id);
    res.status(200).send(await formatSession(await getSessionById(closedSession.id)));
})
app.post('/session/list', async (req, res) => {
    const data = req.body;
    const session = await getSessionById(data.id);
    if (!session) {
        return res.status(404).send("session non trouvé")
    }
    res.status(200).send(await listAttendances(session.id))
})
////// LOGIN & CREDENTIALS
app.post('/login', async (req, res) => {
    //console.log("req:",req);

    const data = req.body;
    const matricule = data.matricule;
    console.log(matricule);

    const email = data.email;
    const password = data.password;
    const profile = await authenticateProfile(matricule, email, password);
    if (profile) {
        console.log("Accés autorisé: ");
        res.status(200).send(profile)
    } else {
        console.log("Accés non autorisé");
        res.status(403).send("Accés non autorisé")
    }


})

initDatabase()
    .then(() => {
        app.listen(3000, () => {
            console.log("Serveur en ecoute");
        });
    })
    .catch((error) => {
        console.error("Impossible de démarrer le serveur :", error);
        process.exit(1);
    });