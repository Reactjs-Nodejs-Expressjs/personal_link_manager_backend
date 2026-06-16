const express = require('express');
const router = express.Router();
const dbStore = require('../models/dbStore');
const auth = require('../middleware/auth');

// @route   GET api/cards
// @desc    Get all cards (with filters, search, pagination)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    // Build filter query
    const query = { isActive: true }; // default public query
    
    if (req.query.category) query.categoryId = req.query.category;
    if (req.query.subCategory) query.subCategoryId = req.query.subCategory;
    if (req.query.subSubCategory) query.subSubCategoryId = req.query.subSubCategory;
    
    if (req.query.search) {
      query.title = { $regex: req.query.search, $options: 'i' };
    }

    // Admins can see inactive cards if query parameter showInactive=true
    if (req.query.showInactive === 'true') {
      delete query.isActive;
    }

    const options = {
      page,
      limit,
      sort: { createdAt: -1 }
    };

    const result = await dbStore.cards.find(query, options);
    res.json(result);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error retrieving cards' });
  }
});

// @route   GET api/cards/:id
// @desc    Get single card by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    // Prevent router clash with bulk endpoints
    if (req.params.id === 'bulk') return;
    
    const card = await dbStore.cards.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }
    res.json({ card });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error retrieving card details' });
  }
});

// @route   POST api/cards
// @desc    Create a new card (Admin only)
// @access  Private
router.post('/', auth, async (req, res) => {
  const {
    title,
    description,
    categoryId,
    subCategoryId,
    subSubCategoryId,
    websiteUrl,
    websiteIframe,
    price,
    currency,
    rating,
    images,
    isActive
  } = req.body;

  try {
    // Validation
    if (!title || !description || !categoryId || !websiteUrl) {
      return res.status(400).json({ message: 'Please include all required fields' });
    }

    const newCard = await dbStore.cards.create({
      title,
      description,
      categoryId,
      subCategoryId,
      subSubCategoryId,
      websiteUrl,
      websiteIframe: websiteIframe || websiteUrl,
      price: price !== undefined ? Number(price) : null,
      currency: currency || 'USD',
      rating: {
        average: rating?.average !== undefined ? Number(rating.average) : 0,
        count: rating?.count !== undefined ? Number(rating.count) : 0
      },
      images: images || [],
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.admin.id,
      updatedBy: req.admin.id
    });

    res.status(201).json({
      card: newCard,
      message: 'Card created successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error creating card' });
  }
});

// @route   PUT api/cards/:id
// @desc    Update a card (Admin only)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const {
    title,
    description,
    categoryId,
    subCategoryId,
    subSubCategoryId,
    websiteUrl,
    websiteIframe,
    price,
    currency,
    rating,
    images,
    isActive
  } = req.body;

  try {
    let card = await dbStore.cards.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    const updateFields = {
      updatedBy: req.admin.id
    };

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (categoryId !== undefined) updateFields.categoryId = categoryId;
    if (subCategoryId !== undefined) updateFields.subCategoryId = subCategoryId;
    if (subSubCategoryId !== undefined) updateFields.subSubCategoryId = subSubCategoryId;
    if (websiteUrl !== undefined) updateFields.websiteUrl = websiteUrl;
    if (websiteIframe !== undefined) updateFields.websiteIframe = websiteIframe;
    if (price !== undefined) updateFields.price = price !== null ? Number(price) : null;
    if (currency !== undefined) updateFields.currency = currency;
    if (images !== undefined) updateFields.images = images;
    if (isActive !== undefined) updateFields.isActive = isActive;
    
    if (rating !== undefined) {
      updateFields.rating = {
        average: rating.average !== undefined ? Number(rating.average) : card.rating.average,
        count: rating.count !== undefined ? Number(rating.count) : card.rating.count
      };
    }

    const updatedCard = await dbStore.cards.findByIdAndUpdate(
      req.params.id,
      updateFields
    );

    res.json({
      card: updatedCard,
      message: 'Card updated successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error updating card' });
  }
});

// @route   DELETE api/cards/:id
// @desc    Delete a card (Admin only)
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const card = await dbStore.cards.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    await dbStore.cards.findByIdAndDelete(req.params.id);
    res.json({ message: 'Card deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error deleting card' });
  }
});

// @route   PATCH api/cards/:id/rating
// @desc    Update rating for a card manually (Admin only)
// @access  Private
router.patch('/:id/rating', auth, async (req, res) => {
  const { rating } = req.body;

  try {
    if (rating === undefined) {
      return res.status(400).json({ message: 'Rating is required' });
    }

    const avgRating = Number(rating);
    if (isNaN(avgRating) || avgRating < 0 || avgRating > 5) {
      return res.status(400).json({ message: 'Rating must be a number between 0 and 5' });
    }

    let card = await dbStore.cards.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ message: 'Card not found' });
    }

    // If card has no reviews yet, count = 1. Else maintain count or increment
    const newCount = card.rating.count === 0 ? 1 : card.rating.count;

    const updatedCard = await dbStore.cards.findByIdAndUpdate(
      req.params.id,
      {
        rating: {
          average: avgRating,
          count: newCount
        }
      }
    );

    res.json({
      card: updatedCard,
      message: 'Rating updated successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error updating rating' });
  }
});

// @route   POST api/cards/bulk
// @desc    Bulk operations: import or export card JSON data (Admin only)
// @access  Private
router.post('/bulk', auth, async (req, res) => {
  const { action, cards } = req.body;

  try {
    if (!action) {
      return res.status(400).json({ message: 'Action field (import/export) is required' });
    }

    if (action === 'export') {
      // Return all cards in db for backup
      const allCards = await dbStore.cards.find({}, { limit: 10000 });
      return res.json({ cards: allCards.cards, total: allCards.total });
    }

    if (action === 'import') {
      if (!Array.isArray(cards)) {
        return res.status(400).json({ message: 'Cards must be an array of card objects' });
      }

      const imported = [];
      const errors = [];

      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c.title || !c.categoryId || !c.websiteUrl) {
          errors.push({ index: i, error: 'Missing required fields (title, categoryId, websiteUrl)' });
          continue;
        }

        try {
          const newCard = await dbStore.cards.create({
            title: c.title,
            description: c.description || '',
            categoryId: c.categoryId,
            subCategoryId: c.subCategoryId,
            subSubCategoryId: c.subSubCategoryId,
            websiteUrl: c.websiteUrl,
            websiteIframe: c.websiteIframe || c.websiteUrl,
            price: c.price !== undefined ? Number(c.price) : null,
            currency: c.currency || 'USD',
            rating: {
              average: c.rating?.average !== undefined ? Number(c.rating.average) : 0,
              count: c.rating?.count !== undefined ? Number(c.rating.count) : 0
            },
            images: c.images || [],
            isActive: c.isActive !== undefined ? c.isActive : true,
            createdBy: req.admin.id,
            updatedBy: req.admin.id
          });
          imported.push(newCard);
        } catch (cardErr) {
          errors.push({ index: i, error: cardErr.message });
        }
      }

      return res.json({
        success: true,
        importedCount: imported.length,
        errorsCount: errors.length,
        errors,
        message: `Imported ${imported.length} cards successfully, ${errors.length} errors.`
      });
    }

    res.status(400).json({ message: 'Invalid action. Must be "import" or "export"' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error running bulk operation' });
  }
});

module.exports = router;
