import express from 'express';

const router = express.Router();

router.get('/users/voir', (req, res) => {
    res.send("Voir un la liste des users");
});

router.get('/users/ajouter', (req, res) => {
    res.send("Ajouter un user");
});

router.get('/users/modifier', (req, res) => {
    res.send("Modifier un user");
});

router.get('/users/delete', (req, res) => {
    res.send("Ajouter un user");
});

export default router;