const express = require('express');
const router = express.Router();
const dbStore = require('../models/dbStore');
const auth = require('../middleware/auth');

// @route   GET api/categories
// @desc    Get all categories
// @access  Public
router.get('/', async (req, res) => {
  try {
    const categories = await dbStore.categories.find({});
    res.json({ categories });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error retrieving categories' });
  }
});

// @route   GET api/categories/:id/subcategories
// @desc    Get sub-categories by parent category ID
// @access  Public
router.get('/:id/subcategories', async (req, res) => {
  try {
    const parentId = req.params.id === 'null' ? null : req.params.id;
    const subCategories = await dbStore.categories.find({ parentId });
    res.json({ subCategories });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error retrieving subcategories' });
  }
});

// @route   POST api/categories
// @desc    Create a new category/subcategory/subsubcategory (Admin only)
// @access  Private
router.post('/', auth, async (req, res) => {
  const { name, type, parentId, order, isActive } = req.body;

  try {
    if (!name || !type) {
      return res.status(400).json({ message: 'Name and type are required' });
    }

    if (!['category', 'subcategory', 'subsubcategory'].includes(type)) {
      return res.status(400).json({ message: 'Invalid category type' });
    }

    // Verify parent ID exists if provided
    if (parentId) {
      const parent = await dbStore.categories.findById(parentId);
      if (!parent) {
        return res.status(400).json({ message: 'Parent category not found' });
      }
    }

    const newCategory = await dbStore.categories.create({
      name,
      type,
      parentId: parentId || null,
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({
      category: newCategory,
      message: 'Category created successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error creating category' });
  }
});

// @route   PUT api/categories/:id
// @desc    Update an existing category (Admin only)
// @access  Private
router.put('/:id', auth, async (req, res) => {
  const { name, type, parentId, order, isActive } = req.body;

  try {
    let category = await dbStore.categories.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    const updateFields = {};
    if (name !== undefined) updateFields.name = name;
    if (type !== undefined) {
      if (!['category', 'subcategory', 'subsubcategory'].includes(type)) {
        return res.status(400).json({ message: 'Invalid category type' });
      }
      updateFields.type = type;
    }
    if (parentId !== undefined) updateFields.parentId = parentId || null;
    if (order !== undefined) updateFields.order = Number(order);
    if (isActive !== undefined) updateFields.isActive = isActive;

    const updatedCategory = await dbStore.categories.findByIdAndUpdate(
      req.params.id,
      updateFields
    );

    res.json({
      category: updatedCategory,
      message: 'Category updated successfully'
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error updating category' });
  }
});

// @route   DELETE api/categories/:id
// @desc    Delete a category (Admin only) - recursively deletes children to prevent orphans
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const category = await dbStore.categories.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Category not found' });
    }

    // Recursively find and delete child subcategories and sub-subcategories
    const deleteChildren = async (parentId) => {
      const children = await dbStore.categories.find({ parentId });
      for (const child of children) {
        await deleteChildren(child._id.toString());
        await dbStore.categories.findByIdAndDelete(child._id.toString());
      }
    };

    await deleteChildren(req.params.id);
    await dbStore.categories.findByIdAndDelete(req.params.id);

    // Note: We don't delete cards that belong to deleted categories, but we can set their category fields to null or delete them
    // For simplicity, let's keep them (soft-delete behavior) or we can clean up cards. Let's just return a success message.
    
    res.json({ message: 'Category and all nested child categories deleted successfully' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error deleting category' });
  }
});

module.exports = router;
