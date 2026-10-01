const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');         // Multer processes the form data, especially file uploads, and makes the file(s) available in the req.file or req.files object, depending on whether a single file or multiple files are being uploaded.
const path = require('path');
const cors = require('cors');
const { error } = require('console');
const cookieParser = require('cookie-parser');


require('dotenv').config();

const app = express();
const port = 3000;

app.use(express.json());
app.use(cookieParser());
// app.use(cors({
//     origin: ['https://shopper-ecommerce-admin-dun.vercel.app'],
//     methods: ['GET', 'POST', 'PUT', 'DELETE'],
// }));
app.use(cors());        // when frontend and backend are on different domains
app.use('/images', express.static('upload/images'))  // serve the files available in upload/images folder on images route

// Connecting Database through Mongoose
mongoose.connect(process.env.DATABASE_URL)
    .then(() => { console.log('Connected to MongoDB'); })
    .catch((err) => { console.error('Error connecting to MongoDB:', err); });



/*************************
*** Model/Table Schema ***
*************************/

const Product = mongoose.models.Product || mongoose.model('Product', {
    id: { type: Number, required: true, unique: true },
    name: { type: String, required: true },
    image: { type: String, required: true },
    category: { type: String, required: true },
    old_price: { type: Number, required: true },
    new_price: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    available: { type: Boolean, default: true }
});

const User = mongoose.models.User || mongoose.model('User', {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    cartData: { type: Object },
    Date: { type: Date, default: Date.now }
});



/***************************
*** Multer Configuration ***
***************************/

// Image Storing Engine, specifying how and where the uploaded files should be stored on my server.
const storage = multer.diskStorage({
    destination: './upload/images',
    filename: (req, file, callback) => {            // req is the request object from Express route handler       // file is the object that contains information about the file being uploaded. It includes properties like: "file.originalname", The original name of the file as it was on the client's system and "file.fieldname", The name of the form field associated with this file.
        return callback(null, `${file.fieldname}_${Date.now()}${path.extname(file.originalname)}`);      //callback is inbuilt callback function that tell Multer what the final filename should be                 // syntax: cb(error, fileName); Passing null as 1st parameter indicates there were no errors in generating the filename.
    }
})

const upload = multer({ storage: storage })



/*******************
*** API Creation ***
*******************/

// Base API
app.get('/', (req, res) => {
    res.send("Express Server Working Correctly");
})

// Upload API
app.post('/upload', upload.single('product'), (req, res) => {
    const base_url = `${req.protocol}://${req.get('host')}` || process.env.BASE_URL;
    res.json({
        success: 1,
        image_url: `${base_url}/images/${req.file.filename}`
    })
})

// Add Products API
app.post("/addProduct", async (req, res) => {
    let products = await Product.find({});
    let id;

    if (products.length >= 1) {
        let last_product = products[products.length - 1];
        id = last_product.id + 1;
    } else {
        id = 1;
    }
    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image,
        category: req.body.category,
        old_price: req.body.old_price,
        new_price: req.body.new_price
    });

    await product.save();

    console.log(product);
    res.json({
        success: true,
        name: req.body.name
    });
})

// Remove Products API
app.post("/removeProduct", async (req, res) => {
    const { id, name } = req.body;
    const result = await Product.findOneAndDelete({ id: id });

    if (result) {
        res.json({ success: true, name });
    } else {
        res.status(404).json({ success: false, message: "Product not found" });
    }
})

// All Products API
app.get("/allProducts", async (req, res) => {
    let products = await Product.find({});

    res.send(products);
})

// New Collection API
app.get("/newCollection", async (req, res) => {
    let products = await Product.find({});

    let newCollection = products.slice(0).slice(-8);      // return last 8 products

    res.send(newCollection);
})

// Popular in Women API
app.get("/popularInWomen", async (req, res) => {
    let products = await Product.find({ category: "women" });

    let popularInWomen = products.splice(0, 4);      // return 1st 4 products

    res.send(popularInWomen);
})

// Fetch User Middleware
const fetchUser = async (req, res, next) => {
    let token = req.header("auth-token");

    if (!token) {
        res.status(401).send({ error: "Please Validate through Valid Token" })
    } else {
        try {
            const data = jwt.verify(token, process.env.JWT_SECRET);
            req.user = data.user
            next();
        } catch (error) {
            res.status(401).send({ error: error });
        }
    }
}

// Adding Product in Cart Data in DB API
app.post("/saveCartData", fetchUser, async (req, res) => {
    let ItemId = req.body.ItemId;
    let userId = req.user.id;

    if (userId) {
        if (ItemId) {
            await User.findOneAndUpdate({ _id: userId }, { $inc: { [`cartData.${ItemId}`]: 1 } });
            console.log("Successfully Added Product no.", ItemId);
            res.status(200).json({ success: 1 });
        } else {
            console.log("Error Adding Product no.", ItemId);
            res.status(400).json({ success: 0, error: "Something went wrong" });
        }
    } else {
        console.log("Error Adding Product no.", ItemId);
        res.status(400).json({ success: 0, error: "Please Login to access Cart" });
    }
})

// Removing Product from Cart Data in DB API
app.post("/removeFromCart", fetchUser, async (req, res) => {
    let ItemId = req.body.ItemId;
    let userId = req.user.id;

    if (ItemId && userId) {
        let userData = await User.findOne({ _id: userId });
        if (userData.cartData[ItemId] > 0) {
            userData.cartData[ItemId] -= 1;
            await User.findOneAndUpdate({ _id: userId }, { cartData: userData.cartData });
            console.log("Successfully Removed Product no.", ItemId);
            res.status(200).json({ success: 1 });
        }
    } else {
        console.log("Error Removing Product no.", ItemId);
        res.status(400).json({ success: 0, error: "Something Went Wrong" });
    }
})

// Getting Data from Cart in DB API
app.post("/getCartData", fetchUser, async (req, res) => {
    let userId = req.user.id;
    let userData = await User.findOne({ _id: userId });

    res.json(userData.cartData);
})

// Sign UP API
app.post("/signUp", async (req, res) => {
    let match = await User.findOne({ email: req.body.email });

    if (match) {
        return res.status(400).json({ success: false, error: "Account Already Exists for this Email Address" })
    }

    let cart = {};
    for (let i = 0; i <= 300; i++) {
        cart[i] = 0;
    }

    const { name, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
        name: name,
        email: email,
        password: hashedPassword,
        cartData: cart
    })

    await newUser.save();
    const data = {
        user: {
            id: newUser.id
        }
    }

    const token = jwt.sign(data, process.env.JWT_SECRET);

    res.json({ success: true, token })
})

// Sign In API
app.post("/signIn", async (req, res) => {
    const { email, password } = req.body;
    let check = await User.findOne({ email: email })

    if (check) {
        let verifyUser = await bcrypt.compare(password, check.password);

        if (verifyUser) {
            const data = {
                user: {
                    id: check.id
                }
            }

            const token = jwt.sign(data, process.env.JWT_SECRET);

            res.cookies
            res.json({ success: true, token });
        } else {
            res.status(400).json({ success: false, error: "Incorrect Email or Password" });
        }
    } else {
        res.status(400).json({ success: false, error: "Incorrect Email or Password" });
    }
})





/*****************************
*** Running Express Server ***
*****************************/

app.listen(port, (error) => {
    if (!error) {
        console.log(`Server is running on port ${port}`);
    } else {
        console.log(`Error: ${error}`);
    }
});
