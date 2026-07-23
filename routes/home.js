const express= require('express')

router=express.Router()

router.get('/', (req,res)=>{
    console.log("get");
    res.send("Page d'acceuil");
})

module.exports= router;