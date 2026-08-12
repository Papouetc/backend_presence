const { log } = require('console');
const express= require('express')
const fs = require('fs');
const cors= require("cors");
const crypto= require('crypto')
const { json } = require('stream/consumers');
//const attendance= require('./routes/attendance')
const { checkInfo,loadSavedFace } = require('./functions/auth')




const app= express()

//app.use(attendance);
app.use(cors());
app.use(express.json())

let sessions = [];
try {
    const raw = fs.readFileSync("src/session.json", "utf-8");
    sessions = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(sessions)) {
        sessions = [];
    }
} catch (err) {
    sessions = [];
}

console.log("sessions: ", sessions);

let users= fs.readFileSync("src/users.json", "utf-8");
users= JSON.parse(users);
//console.log('users:', users);

function getStatus(session) {
    if (session.clotureeManuellement==true) {
        return false
    }else{
        if (session.qrExpireAt<Date.now()) {
            return false
        }else{
            return true
        }
    }

}

app.get('/', (req,res)=>{
    console.log("get");
    res.send("Page d'acceuil");
})
//// PRESENCE
app.post('/presence/statut/manuel', (req,res)=>{
    const data= req.body;
    const session= sessions.find(e=> e.id== data.id)
    console.log(session);
    const statut= data.statut;
    if (!session) {
        return res.status(404).send("session non trouvé")
    }
    const student= session.presences.find(q=> q.matricule == data.matricule);
    if (!student) {
        return res.status(404).send("etudiant non trouvé")
    }
    student.statut= statut;
    fs.writeFileSync("src/session.json", JSON.stringify(sessions), (err)=>{
        if (err) console.log(err);
     })
     res.status(200).send(student)
})
app.post('/presence/scan', (req,res)=>{
    if (!req.body.matricule || !req.body.qrToken) {
        return res.status(400).send("Données invalides")
    }
    const data= req.body;
     const session= sessions.find(e=>
        e.qrToken==data.qrToken
     )
     if (!session) {
        return res.status(404).send("session inexistante")
        
     }else if (getStatus(session)!=true) {
        return res.status(400).send("Session expiré ou invalide")
     }else  if(session.classe!=data.classe) {
        return res.status(403).send("Vous ne faites pas partie de cette classe")
     }
    const dejascane= session.presences.find(q=>
        q.matricule==data.matricule
    )
    if (dejascane) {
        return res.status(409).send("Vous avez deja scanné pour cette session")
    }
    const seuilRetard= 5*60000;
    const status= ((Date.now() -session.date)>seuilRetard? "retard": "present")
    const presence={
        matricule: data.matricule,
        date: Date.now(),
        name: data.name,
        surname: data.surname,
        statut: status
    };
    session.presences.push(presence);
    fs.writeFileSync("src/session.json", JSON.stringify(sessions), (err)=>{
       if (err) console.log(err);
        
    })
    res.status(200).send(presence);
});

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
app.post('/session',(req,res)=>{
    const data= req.body;
    const exist = sessions.find(e=>
        e.prof==data.prof &&  getStatus(e)==true
    );
    console.log(exist);
    if (exist) {
        res.status(409).send(exist)
        return
    } 
    const dureeMinutes= data.duree || 15;
    const qrExpireAt= new Date(Date.now() + dureeMinutes*60000).getTime();
    const session_i={
        id: crypto.randomUUID(),
        classe: data.classe,
        prof: data.prof,
        matiere: data.matiere,
        date: new Date(),
        qrToken: crypto.randomUUID(),
        qrExpireAt: qrExpireAt,
        clotureeManuellement: false,
        presences: []
    }
    sessions.push(session_i)
    fs.writeFileSync("src/session.json", JSON.stringify(sessions), (err)=>{
        if (err) console.log(err);
    })
    res.status(200).send(session_i)
})

app.post('/session/stop',(req,res)=>{
    const data= req.body;
    const session= sessions.find(e=> e.id== data.id)
    console.log(session);
    
    if (!session) {
        return res.status(404).send("session non trouvé")
    }
    if (getStatus(session)==false || session.clotureeManuellement==true) {
        return res.status(404).send("session expiré ou deja cloturée")
    }
    session.clotureeManuellement= true
    fs.writeFileSync("src/session.json", JSON.stringify(sessions), (err)=>{
        if (err) console.log(err);
         
     })
    res.status(200).send(session)
})
app.post('/session/list', (req,res)=>{
    const data= req.body;
    const session= sessions.find(e=> e.id== data.id)
    console.log(session);
    
    if (!session) {
        return res.status(404).send("session non trouvé")
    }
    res.status(200).send(session.presences)
})
////// LOGIN & CREDENTIALS
app.post('/login',(req,res)=>{
    //console.log("req:",req);
    
    const data= req.body;
    const matricule= data.matricule;
    console.log(matricule);
    
    const  email= data.email;
    const password= data.password;
    let verify= checkInfo(matricule,email,password,users);
    log("verify:", verify)
    if(verify.check){
        console.log("Accés autorisé: ");
        res.status(200).send(users[verify.i])
    }else{
        console.log("Accés non autorisé");
        res.status(403).send("Accés non autorisé")
    }
    

})
    
app.listen(3000, ()=>{
    console.log("Serveur en ecoute");
    
})