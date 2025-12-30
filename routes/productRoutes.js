const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const upload = require('../middleware/uploadMiddleware');

router.post("/", upload.array('productImages', 5), productController.createProduct);
router.get("/", productController.getAllProducts);
router.get("/:id", productController.getSingleProduct); 
router.put("/:id", upload.array('productImages', 5), productController.updateProduct);
router.delete("/:id", productController.deleteProduct); 

module.exports = router;

