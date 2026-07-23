function checkInfo(matricule,email,password,users) {
    let check = false;
    let i;
   // console.log("users:", users)
    for (i = 0; i < users.length; i++) {
        if (users[i].matricule == matricule){
            console.log("users[i].matricule:",users[i].matricule);
            console.log("found !!",matricule);
            check= true;
            break;
    }
}
if (check== true) {
    if(users[i].password == password /* && users[i].email== email */){
        check= true;
    }else{
        check= false
    }
    //console.log("check:", check);
}
 const info= {
    check,
    i
 }
return info
}

 function loadSavedFace(users) {
    const data = localStorage.getItem('users');
    if (data) {
        users = JSON.parse(data);
        return users
    } else {
        users = [];
        return users
    }
    
}

module.exports= {
    loadSavedFace,
    checkInfo
}