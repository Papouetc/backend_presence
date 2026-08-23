import express from 'express';

const router = express.Router();

router.get('/', (req, res) => {
    console.log("get");
    res.send("Page d'acceuil");
})

export default router;