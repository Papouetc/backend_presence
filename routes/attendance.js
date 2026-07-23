const express= require('express')

router=express.Router();

router.use(express.json());

router.post('/attendance', (req,res)=>{
    console.log(req.body);
    res.end();
    
});
    


module.exports= router;