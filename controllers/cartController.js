const Cart = require('../models/Cart');
const Product = require('../models/Product');

// --- HELPER: Map Items for Response (Consistent Format) ---
// This ensures basePrice, isOutofStock, and maxStock are always sent to frontend
const mapCartItems = (items) => {
  return items.map(item => {
    const product = item.product;

    // Safety check: if product is null, return raw item
    if (!product) return item;

    // Determine availability based on product status and global stock
    const isUnavailable = product.status === 'Draft' || product.stockQuantity <= 0;

    return {
      ...item.toObject(),
      basePrice: product.basePrice, // <--- CRITICAL: Sends Original Price to Frontend
      isOutofStock: isUnavailable,
      maxStock: isUnavailable ? 0 : product.stockQuantity
    };
  });
};

// --- HELPER: Recalculate Totals ---
const recalculateCart = (cart) => {
  let subtotal = 0;

  // 1. Calculate Subtotal
  cart.items.forEach(item => {
    if (item.product) {
      // Only add price if Product is Active AND has Stock
      if (item.product.status === 'Active' && item.product.stockQuantity > 0) {
        subtotal += (item.price * item.quantity);
      }
    }
  });

  cart.totalPrice = subtotal;

  // 2. SAFETY: If cart is modified/recalculated, reset coupon to prevent invalid discounts
  cart.coupon = null;
  cart.discountAmount = 0;
  cart.totalAfterDiscount = subtotal;
};

// ==========================================
//  CONTROLLER FUNCTIONS
// ==========================================

exports.getCart = async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user })
      .populate('items.product')
      .populate('savedItems.product')
      .populate('coupon');

    if (!cart) {
      cart = await Cart.create({ user: req.user, items: [] });
    }

    // --- 1. CLEANUP: Remove Deleted Products ---
    const validItems = cart.items.filter(item => item.product !== null);
    let isDirty = false; // Flag to track if we need to save changes

    if (validItems.length < cart.items.length) {
      cart.items = validItems;
      isDirty = true;
    }

    // --- 2. LOGIC FIX: Verify Total ---
    // Calculate what the total SHOULD be right now
    let calculatedTotal = 0;
    cart.items.forEach(item => {
      if (item.product && item.product.status === 'Active' && item.product.stockQuantity > 0) {
        calculatedTotal += (item.price * item.quantity);
      }
    });

    // If the database total differs from the calculated total (e.g. item went OOS)
    if (cart.totalPrice !== calculatedTotal) {
      recalculateCart(cart); // This sets price, resets coupon, and handles OOS exclusion
      isDirty = true;
    }

    if (isDirty) {
      await cart.save();
    }

    // --- 3. RETURN FULL CART STRUCTURE ---
    res.json({
      _id: cart._id,
      items: mapCartItems(cart.items), // Uses Helper
      savedItems: mapCartItems(cart.savedItems || []), // Include Saved Items
      totalPrice: cart.totalPrice,
      discountAmount: cart.discountAmount,
      totalAfterDiscount: cart.totalAfterDiscount,
      coupon: cart.coupon ? cart.coupon.code : null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch cart' });
  }
};

exports.addToCart = async (req, res) => {
  const { productId, size, quantity } = req.body;
  const qtyToAdd = parseInt(quantity);

  if (!productId || !size || !qtyToAdd || qtyToAdd < 1) {
    return res.status(400).json({ message: 'Invalid data' });
  }

  // Global maximum limit per item
  if (qtyToAdd > 12) return res.status(400).json({ message: 'Max 12 units per item.' });

  try {
    const product = await Product.findById(productId);
    if (!product || product.status !== 'Active') {
      return res.status(404).json({ message: 'Product unavailable' });
    }

    // --- FIX: Get stock for the SPECIFIC SIZE ---
    const sizeData = product.sizes.find(s => s.size === size);
    if (!sizeData) {
      return res.status(400).json({ message: 'Selected size not found' });
    }

    let cart = await Cart.findOne({ user: req.user });
    if (!cart) cart = await Cart.create({ user: req.user, items: [] });

    const index = cart.items.findIndex(p => p.product.toString() === productId && p.size === size);

    if (index > -1) {
      const currentQtyInCart = cart.items[index].quantity;
      const newTotalQty = currentQtyInCart + qtyToAdd;

      // Check against both global limit and SPECIFIC size stock
      if (newTotalQty > 12) return res.status(400).json({ message: 'Limit reached (Max 12 per item).' });
      if (newTotalQty > sizeData.stock) {
        return res.status(400).json({
          message: `Only ${sizeData.stock} units of size ${size} are available. You already have ${currentQtyInCart} in cart.`
        });
      }

      cart.items[index].quantity = newTotalQty;
    } else {
      // New item entry - Check specific size stock
      if (qtyToAdd > sizeData.stock) {
        return res.status(400).json({ message: `Only ${sizeData.stock} units left for size ${size}.` });
      }

      cart.items.push({
        product: productId,
        size,
        quantity: qtyToAdd,
        price: product.price
      });
    }

    recalculateCart(cart);
    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate('items.product');

    res.json({
      items: mapCartItems(updatedCart.items), // Uses Helper
      totalPrice: updatedCart.totalPrice,
      discountAmount: updatedCart.discountAmount,
      totalAfterDiscount: updatedCart.totalAfterDiscount,
      coupon: null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error' });
  }
};

exports.updateCart = async (req, res) => {
  const { cartItemId, quantity } = req.body;
  const newQty = parseInt(quantity);

  if (newQty > 12) return res.status(400).json({ message: 'Max 12 units per item.' });

  try {
    // Populate product to check size stock
    const cart = await Cart.findOne({ user: req.user }).populate('items.product');
    const item = cart.items.id(cartItemId);

    if (!item) return res.status(404).json({ message: 'Item not found' });

    // --- FIX: Find the specific size stock from the populated product ---
    const specificSizeData = item.product.sizes.find(s => s.size === item.size);

    if (specificSizeData && newQty > specificSizeData.stock) {
      return res.status(400).json({
        message: `Only ${specificSizeData.stock} units available for size ${item.size}.`
      });
    }

    item.quantity = newQty;

    recalculateCart(cart);
    await cart.save();

    res.json({
      items: mapCartItems(cart.items), // Uses Helper
      savedItems: mapCartItems(cart.savedItems || []), // Include Saved Items
      totalPrice: cart.totalPrice,
      discountAmount: cart.discountAmount,
      totalAfterDiscount: cart.totalAfterDiscount,
      coupon: null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Update failed' });
  }
};

exports.removeItem = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user });

    // Remove item
    cart.items = cart.items.filter(item => item._id.toString() !== req.params.id);

    // --- RECALCULATE & SAVE ---
    recalculateCart(cart);
    await cart.save();

    const updatedCart = await Cart.findById(cart._id).populate('items.product');

    res.json({
      items: mapCartItems(updatedCart.items), // Uses Helper
      totalPrice: updatedCart.totalPrice,
      discountAmount: updatedCart.discountAmount,
      totalAfterDiscount: updatedCart.totalAfterDiscount,
      coupon: null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Remove failed' });
  }
};

exports.removeCoupon = async (req, res) => {
  try {
    const cart = await Cart.findOne({ user: req.user });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    // 1. Reset coupon fields
    cart.coupon = null;
    cart.discountAmount = 0;
    cart.totalAfterDiscount = cart.totalPrice; // Reset total to subtotal

    await cart.save();

    // 2. Fetch fresh data
    const updatedCart = await Cart.findById(cart._id).populate('items.product');


    res.json({
      _id: updatedCart._id,
      items: mapCartItems(updatedCart.items), // Uses Helper
      totalPrice: updatedCart.totalPrice,
      discountAmount: 0,
      totalAfterDiscount: updatedCart.totalPrice,
      coupon: null
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to remove coupon' });
  }
};

// ==========================================
//  SAVE FOR LATER LOGIC
// ==========================================

exports.saveForLater = async (req, res) => {
  const { cartItemId } = req.body;

  try {
    const cart = await Cart.findOne({ user: req.user });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    // Find item in main cart
    const itemIndex = cart.items.findIndex(p => p._id.toString() === cartItemId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found in cart' });

    // Perform the Move
    const itemToSave = cart.items[itemIndex];

    // Explicitly create object to avoid Mongoose subdocument issues
    cart.savedItems.push({
      product: itemToSave.product._id, // Use ID
      size: itemToSave.size,
      quantity: itemToSave.quantity,
      price: itemToSave.price
    });

    cart.items.splice(itemIndex, 1); // Remove from main cart

    // Recalculate
    recalculateCart(cart);
    await cart.save();

    res.json({ success: true, message: 'Saved for later' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to save for later' });
  }
};

exports.moveToCart = async (req, res) => {
  const { savedItemId } = req.body;

  try {
    const cart = await Cart.findOne({ user: req.user }).populate('savedItems.product');
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    const itemIndex = cart.savedItems.findIndex(p => p._id.toString() === savedItemId);
    if (itemIndex === -1) return res.status(404).json({ message: 'Item not found in saved list' });

    const itemToMove = cart.savedItems[itemIndex];
    const product = itemToMove.product;

    if (!product || product.status !== 'Active') {
      return res.status(400).json({ message: 'Product is no longer available.' });
    }

    // --- CHECK STOCK BEFORE MOVING BACK ---
    const sizeData = product.sizes.find(s => s.size === itemToMove.size);
    if (!sizeData || sizeData.stock < itemToMove.quantity) {
      return res.status(400).json({ message: `Not enough stock available for size ${itemToMove.size}.` });
    }

    // Check Global Limit (12)
    // We check against existing items in the main cart to ensure we don't exceed the limit
    const existingIndex = cart.items.findIndex(p => p.product.toString() === product._id.toString() && p.size === itemToMove.size);
    let currentQty = 0;
    if (existingIndex > -1) {
      currentQty = cart.items[existingIndex].quantity;
    }

    if (currentQty + itemToMove.quantity > 12) {
      return res.status(400).json({ message: 'Cannot move. Exceeds limit of 12 items.' });
    }

    // Perform Move
    if (existingIndex > -1) {
      cart.items[existingIndex].quantity += itemToMove.quantity;
    } else {
      cart.items.push({
        product: product._id,
        size: itemToMove.size,
        quantity: itemToMove.quantity,
        price: product.price // Use current product price
      });
    }

    cart.savedItems.splice(itemIndex, 1);

    recalculateCart(cart);
    await cart.save();

    res.json({ success: true, message: 'Moved to cart' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to move to cart' });
  }
};

exports.removeSavedItem = async (req, res) => {
  const { id } = req.params;

  try {
    const cart = await Cart.findOne({ user: req.user });
    if (!cart) return res.status(404).json({ message: 'Cart not found' });

    // Filter out the item
    cart.savedItems = cart.savedItems.filter(item => item._id.toString() !== id);

    await cart.save();

    res.json({ success: true, message: 'Removed' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to remove saved item' });
  }
};