const express = require('express');
const router = express.Router();
const { roomController, createRoomSchema, getRoomSchema } = require('../controllers/roomController');
const { validate } = require('../middleware/validationMiddleware');

router.post('/', validate(createRoomSchema), roomController.createRoom);
router.get('/', roomController.listRooms);
router.get('/:code', validate(getRoomSchema), roomController.getRoom);

module.exports = router;
