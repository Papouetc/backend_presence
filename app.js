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

app.post('/presence/scan', (req,res)=>{
    if (!req.body.matricule || !req.body.qrToken) {
        res.status(400).send("Données invalides")
    }
    const data= req.body;
     const session= sessions.find(e=>
        e.qrToken==data.qrToken
     )
     if (!session) {
        return res.send("session inexistante").status(404)
        
     }else if (getStatus(session)!=true) {
        return res.send("Session expiré ou invalide")
     }else  if(session.classe!=data.classe) {
        return res.send("Vous ne faites pas partie de cette classe").status(403)
     }
    const dejascane= session.presences.find(q=>
        q.matricule==data.matricule
    )
    if (dejascane) {
        return res.send("Vous avez deja scanné pour cette session").status(409)
    }
    const seuilRetard= 5*60000;
    const status= ((Date.now() -session.date)>seuilRetard? "retard": "present")
    const presence={
        matricule: data.matricule,
        date: Date.now(),
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

app.post('/session',(req,res)=>{
    const data= req.body;
    const exist = sessions.find(e=>
        e.prof==data.prof &&  getStatus(e)==true
    );
    console.log(exist);
    if (exist) {
        res.status(409).send("Vous avez déja une session existante")
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
    fs.writeFile("src/session.json",JSON.stringify(sessions),(err) => {
    if(err) console.log(err);
})
    res.status(200).send(session_i)
})

app.get('/login',(req,res)=>{
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
