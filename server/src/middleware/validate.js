const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const messages = error.details.map(detail => detail.message).join('. ');
      return res.status(400).json({
        success: false,
        message: messages
      });
    }
    next();
  };
};

// Validation schemas
const schemas = {
  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).max(50).required(),
    phone: Joi.string().pattern(/^[6-9]\d{9}$/).optional(),
    role: Joi.string().valid('customer', 'farmer', 'delivery').optional()
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }),

  createProduct: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    description: Joi.string().min(10).max(2000).required(),
    category: Joi.string().valid(
      'vegetables', 'fruits', 'grains', 'pulses', 'dairy',
      'spices', 'herbs', 'nuts', 'honey', 'oils',
      'flowers', 'organic', 'millets', 'seeds', 'other'
    ).required(),
    price: Joi.number().min(0).required(),
    originalPrice: Joi.number().min(0).optional(),
    unit: Joi.string().valid('kg', 'g', '500g', 'dozen', 'piece', 'litre', 'ml', 'bundle', 'packet').required(),
    stock: Joi.number().min(0).required(),
    isOrganic: Joi.boolean().optional(),
    tags: Joi.array().items(Joi.string()).optional(),
    shelfLife: Joi.string().optional(),
    deliveryEstimate: Joi.string().optional()
  }),

  updateProduct: Joi.object({
    name: Joi.string().min(2).max(100).optional(),
    description: Joi.string().min(10).max(2000).optional(),
    category: Joi.string().optional(),
    price: Joi.number().min(0).optional(),
    originalPrice: Joi.number().min(0).optional(),
    unit: Joi.string().optional(),
    stock: Joi.number().min(0).optional(),
    isOrganic: Joi.boolean().optional(),
    isAvailable: Joi.boolean().optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }),

  createOrder: Joi.object({
    farmerId: Joi.string().required(),
    items: Joi.array().items(Joi.object({
      product: Joi.string().required(),
      quantity: Joi.number().min(1).required()
    })).min(1).required(),
    deliveryAddress: Joi.string().required(),
    paymentMethod: Joi.string().valid('razorpay', 'cod').required(),
    deliverySlot: Joi.object({
      date: Joi.date().optional(),
      timeSlot: Joi.string().optional()
    }).optional(),
    notes: Joi.string().max(500).optional()
  }),

  createAddress: Joi.object({
    label: Joi.string().valid('home', 'work', 'other').optional(),
    fullName: Joi.string().required(),
    phone: Joi.string().required(),
    street: Joi.string().required(),
    landmark: Joi.string().optional(),
    city: Joi.string().required(),
    state: Joi.string().required(),
    pincode: Joi.string().pattern(/^\d{6}$/).required(),
    location: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).optional()
    }).optional(),
    isDefault: Joi.boolean().optional()
  }),

  createReview: Joi.object({
    rating: Joi.number().min(1).max(5).required(),
    title: Joi.string().max(100).optional(),
    comment: Joi.string().min(5).max(1000).required(),
    productId: Joi.string().optional(),
    farmerId: Joi.string().optional(),
    orderId: Joi.string().optional()
  }),

  createComplaint: Joi.object({
    orderId: Joi.string().optional(),
    subject: Joi.string().max(200).required(),
    description: Joi.string().max(2000).required(),
    category: Joi.string().valid('quality', 'delivery', 'payment', 'service', 'other').optional()
  }),

  farmerProfile: Joi.object({
    farmName: Joi.string().max(100).optional(),
    description: Joi.string().max(1000).optional(),
    specialties: Joi.array().items(Joi.string()).optional(),
    location: Joi.object({
      coordinates: Joi.array().items(Joi.number()).length(2).optional(),
      address: Joi.string().optional(),
      city: Joi.string().optional(),
      state: Joi.string().optional(),
      pincode: Joi.string().optional()
    }).optional(),
    operatingHours: Joi.object({
      open: Joi.string().optional(),
      close: Joi.string().optional()
    }).optional(),
    deliveryRadius: Joi.number().max(50).optional(),
    minimumOrder: Joi.number().min(0).optional()
  }),

  faceEnroll: Joi.object({
    image: Joi.string().min(100).required()
      .messages({ 'string.min': 'Image data is too small — not a valid face image' })
  }),

  faceVerify: Joi.object({
    email: Joi.string().email().required(),
    image: Joi.string().min(100).required()
      .messages({ 'string.min': 'Image data is too small — not a valid face image' })
  })
};

module.exports = { validate, schemas };
