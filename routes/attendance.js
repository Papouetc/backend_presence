import express from 'express';

const router = express.Router();

router.use(express.json());

router.post('/attendance', (req, res) => {
    console.log(req.body);
    res.end();

});



export default router;