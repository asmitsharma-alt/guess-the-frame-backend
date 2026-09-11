const roomService = require('../services/roomService');
const { z } = require('zod');

const createRoomSchema = z.object({
  body: z.object({
    settings: z.object({
      category: z.string().optional(),
      categories: z.array(z.string()).optional(),
      rounds: z.number().min(1).max(50).optional(),
      timer: z.number().min(5).max(120).optional(),
      judgeMode: z.boolean().optional()
    }).optional()
  })
});

const getRoomSchema = z.object({
  params: z.object({
    code: z.string().length(4)
  })
});

class RoomController {
  async createRoom(req, res, next) {
    try {
      const hostId = req.user ? req.user.userId : null;
      const settings = req.body.settings || {};
      const room = await roomService.createRoom({ hostId, settings });

      res.status(201).json({
        success: true,
        data: {
          code: room.code,
          status: room.status,
          settings: room.settings
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async getRoom(req, res, next) {
    try {
      const code = req.params.code.toUpperCase();
      const room = roomService.getRoom(code);

      if (!room) {
        return res.status(404).json({
          success: false,
          error: `Room "${code}" not found`
        });
      }

      res.json({
        success: true,
        data: {
          code: room.code,
          status: room.status,
          playerCount: room.players.size,
          settings: room.settings
        }
      });
    } catch (err) {
      next(err);
    }
  }

  async listRooms(req, res, next) {
    try {
      const rooms = roomService.getAllActiveRooms();
      res.json({
        success: true,
        data: rooms
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  roomController: new RoomController(),
  createRoomSchema,
  getRoomSchema
};
