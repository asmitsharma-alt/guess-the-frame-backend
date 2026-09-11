const catalogService = require('../services/catalogService');

class CatalogController {
  async getAll(req, res, next) {
    try {
      const catalog = await catalogService.getAllCatalog();
      res.json({
        success: true,
        data: catalog
      });
    } catch (err) {
      next(err);
    }
  }

  async getByCategory(req, res, next) {
    try {
      const { category } = req.params;
      const items = await catalogService.getCatalogByCategory(category);
      res.json({
        success: true,
        data: items
      });
    } catch (err) {
      next(err);
    }
  }

  async getPlaylist(req, res, next) {
    try {
      const settings = {
        category: req.query.category,
        categories: req.query.categories ? req.query.categories.split(',') : undefined,
        rounds: req.query.rounds ? parseInt(req.query.rounds, 10) : undefined
      };
      const playlist = await catalogService.generatePlaylist(settings);
      res.json({
        success: true,
        data: playlist
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = {
  catalogController: new CatalogController()
};
