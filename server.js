require("dotenv").config();
const express=require("express");
const mongoose=require("mongoose");
const path=require("path");
const cookieParser = require('cookie-parser');
const passport = require('passport');
require('./config/passport'); // just load strategy

const dns = require('node:dns');

dns.setDefaultResultOrder('ipv4first');

const app=express();

const productRoutes=require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const teamRoutes = require("./routes/teamRoutes");  
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes'); 
const cartRoutes = require('./routes/cartRoutes');
const wishlistRoutes=require('./routes/wishlistRoutes');
const addressRoutes=require('./routes/addressRoutes');
const paymentRoutes=require('./routes/paymentRoutes');
const couponRoutes = require('./routes/couponRoutes');
const orderRoutes=require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const contactRoutes = require('./routes/contactRoutes');
const statsRoutes = require('./routes/statsRoutes');
const saleRoutes=require('./routes/saleRoutes');
const startScheduler = require('./jobs/saleScheduler'); // Import



const PORT=process.env.PORT || 3000;

//-------------------------Middlewares---------------------------

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname,"public")));
app.use(cookieParser());
app.use(passport.initialize());

//---------------------------Database Connection--------------------------

mongoose.connect(process.env.MONGO_URI)
    .then(()=>{
        console.log("MongoDB Connected Successfully ✅")
    })
    .catch((err)=>{
        console.log("MongoDB Connection Failed ❌",err);
    })

//--------------------------API Routes-----------------------------  

// Import the Product Routes (the Controller logic is now handled here)

app.use("/api/products",productRoutes);     // All requests to /api/products go to productRoutes.js
app.use("/api/categories", categoryRoutes); 
app.use("/api/teams", teamRoutes);    
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/sales',saleRoutes);





//--------------------------View Routes-----------------------------

//---User Pages---

app.get("/User",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","User","index.html"))
});

app.get("User/products",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","User","products.html"))
})

app.get("User/cart",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","User","cart.html"))
})

//---Admin pages---

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "Admin", "dashboard.html"));
});

app.get("/admin/add-product", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "Admin", "add-product.html"));
});

app.get("/admin/product-list", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "Admin", "product-list.html"));
});

startScheduler();

//-------------------------Start Server-------------------------------

app.listen(PORT,()=>{
    console.log(
`server running at http://localhost:${PORT}
User side running at http://localhost:${PORT}/User
Admin side running at http://localhost:${PORT}/Admin`); 
});         