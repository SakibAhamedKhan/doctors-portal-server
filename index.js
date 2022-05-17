const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { query } = require('express');
const jwt = require('jsonwebtoken');
const res = require('express/lib/response');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 5000;


app.use(cors());
app.use(express.json());



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PAS}@cluster0.g5me0.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });


function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if(!authHeader){
    return res.status(401).send({message: 'UnAuthorized Access'});
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function(err, decoded) {
    if(err){
      return res.status(403).send({message: 'Forbidden Access'});
    }
    console.log(decoded) // bar
    req.decoded = decoded;
    next();
  });
}


async function run() {
  try{

    await client.connect();
    const servicesCollection = client.db('doctors_portal').collection('services');
    const bookingsCollection = client.db('doctors_portal').collection('bookings');
    const usersCollection = client.db('doctors_portal').collection('users');

    app.get('/service', async(req,res) => {
      const query = {};
      const cursor = servicesCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    })

    app.get('/user', verifyJWT, async(req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })

    app.get('/admin/:email', async(req, res) => {
      const email = req.params.email;
      const user = await usersCollection.findOne({email: email});
      const isAdmin = user.role === 'admin';
      res.send({admin:isAdmin});
    })


    app.put('/user/admin/:email', verifyJWT , async(req,res) => {
      const email = req.params.email;

      const requester = req.decoded.email;
      const requesterAccount = await usersCollection.findOne({email: requester});
      if(requesterAccount.role === 'admin'){
        const filter = {email: email};
        const updateDoc = {
          $set: {role:'admin'},
        }
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      } else {
        res.status(403).send({message: 'Forbidden access'})
      }

      
    })



    app.put('/user/:email', async(req,res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = {email: email};
      const options = { upsert: true};
      const updateDoc = {
        $set: user,
      }
      const result = await usersCollection.updateOne(filter, updateDoc, options);
      const token =  jwt.sign({email: email}, process.env.ACCESS_TOKEN_SECRET, {expiresIn: '1h'});
      // console.log({result, token});
      res.send({result, token});
    })

    // Warning
    // This is not the proper way to query.
    // After learning more about mongodb. use aggregate lookup, pipeline, match, group
    app.get('/available', async(req, res) => {
      const date = req.query.date;

      // step 1: get All services.
      const services = await servicesCollection.find().toArray();
      // step 2: get the booking of the day :  output: [{booking},{booking},{booking}, {booking}, {booking}, {booking}].
      const query = {date:date};
      const bookings = await bookingsCollection.find(query).toArray();

      // step 3: for each service.
      services.forEach(service => {
        // step 4: find bookings for that service: output:[{booking for that service},{booking for that service}].
        const serviceBookings =  bookings.filter(b => b.treatment === service.name)
        // step 5: select slot for the serviceBookings: output: ['','','',''].
        const bookedSlots = serviceBookings.map(book=> book.slot);
        // step 6: Select those slots that are not in bookSlots.
        const available = service.slots.filter(s=> !bookedSlots.includes(s));
        service.slots = available
      })
      res.send(services);
    })
    /**
     * API Naming Convention
     * app.get('/booking') // get all bookings in this collection. or get more than one or by filter
     * app.get('/booking/:id') // get a specific booking
     * app.post('/booking') // add a new booking
     * app.patch('/booking/:id') // update a specific booking
     * app.delete('/booking/:id') // delete a specific booking
     */

    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if(patient === decodedEmail){
        const query = {patient: patient};
        const bookings =await bookingsCollection.find(query).toArray();
        // console.log(bookings);
        return res.send(bookings);
      } else{
        return res.status(403).send({message: 'Forbidden Access'});
      }
      
    })

    app.post('/booking', async (req,res) => {
      const booking = req.body;

     
      const query = {treatment: booking.treatment, date: booking.date, patient: booking.patient};
      const exists = await bookingsCollection.findOne(query);
      if(exists){
        return res.send({success:false, booking:exists});
      }
      const result = await bookingsCollection.insertOne(booking);
      res.send({success:true, result});
    })


  }
  finally{

  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})