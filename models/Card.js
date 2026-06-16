const mongoose = require('mongoose');

const CardSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subCategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subSubCategoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  websiteUrl: {
    type: String,
    required: true,
    trim: true
  },
  websiteIframe: {
    type: String
  },
  price: {
    type: Number,
    default: null
  },
  currency: {
    type: String,
    default: 'USD'
  },
  rating: {
    average: {
      type: Number,
      default: 0
    },
    count: {
      type: Number,
      default: 0
    }
  },
  images: {
    type: [String],
    default: []
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  }
}, {
  timestamps: true
});

// Middleware to auto-generate websiteIframe from websiteUrl if it isn't specified
CardSchema.pre('save', function(next) {
  if (this.websiteUrl && !this.websiteIframe) {
    this.websiteIframe = this.websiteUrl;
  }
  next();
});

module.exports = mongoose.model('Card', CardSchema);
