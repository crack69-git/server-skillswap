const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const { MongoClient, ServerApiVersion } = require("mongodb");

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();
const app = express();

app.use(cors());

app.use(express.json());

const { ObjectId } = require("mongodb");
const port = 5000;
const uri = process.env.MONGODB_URL;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
const jose = require("jose-cjs");
const JWKS = jose.createRemoteJWKSet(
  new URL(`${process.env.BASE_URL}/api/auth/jwks`),
);
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ message: "Authorization header missing" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token missing" });
  }
  try {
    const { payload } = await jose.jwtVerify(token, JWKS);

    req.user = payload;
    next();
  } catch (err) {
    console.error(err);
    return res.status(401).json({ message: "Invalid token" });
  }
};

client
  .connect(() => {
    console.log("Connected to MongoDB");
  })
  .catch(console.dir);
// fixing
// async function run() {
//   try {
//     // Connect the client to the server	(optional starting in v4.7)
//     await client.connect();
// Send a ping to confirm a successful connection
const database = client.db("skillswap");
const tasksCollection = database.collection("tasks");
const proposalsCollection = database.collection("proposals");
const usersCollection = database.collection("user");
const paymentsCollection = database.collection("payments");
const freelancersCollection = database.collection("freelancers");

//stripe checkout
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/api/freelancers/profile", verifyToken, async (req, res) => {
  try {
    const freelancer = req.body;
    const result = await freelancersCollection.insertOne(freelancer);
    res.json({ success: true, freelancerId: result.insertedId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  try {
    console.log("Checkout endpoint called");
    console.log("Body:", req.body);
    console.log("Stripe key exists:", !!process.env.STRIPE_SECRET_KEY);
    const { proposalId } = req.body;
    console.log("Proposal ID received:", proposalId);

    const proposal = await proposalsCollection.findOne({
      _id: new ObjectId(proposalId),
    });
    console.log("Proposal found:", proposal);
    if (!proposal) {
      return res.status(404).json({
        message: "Proposal not found",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],

      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: proposal.taskTitle,
            },
            unit_amount: proposal.bid * 100,
          },
          quantity: 1,
        },
      ],

      metadata: {
        proposalId: proposal._id.toString(),
        taskId: proposal.taskId.toString(),
        taskTitle: proposal.taskTitle.toString(),
        clientId: proposal.clientId.toString(),
        freelancerMail: proposal.freelancerMail.toString(),
        deadline: proposal.date.toString(),
      },

      success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.BASE_URL}/unsuccessful`,
    });

    res.json({
      url: session.url,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      message: err.message,
    });
  }
});

// total earning in paymentcollection
app.get("/api/payments/total-earning", verifyToken, async (req, res) => {
  try {
    const payments = await paymentsCollection.find({}).toArray();
    const totalEarning = payments.reduce(
      (sum, payment) => sum + Number(payment.amount_received), // ✅ cast to Number
      0,
    );
    res.json({ totalEarning });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// get sum of amout_received from payments collection with freelancerMail
app.get("/api/payments/sum/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  try {
    const payments = await paymentsCollection
      .find({ freelancerMail: email })
      .toArray();

    res.json({ payments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
//patch task status
app.patch("/api/tasks/status/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;
  try {
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    res.json({
      success: true,
      message: "Task status updated successfully",
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
//by inputing current session freelancer email get taskId of those task which are status accepted and return all the task with the same taskId
app.get("/api/proposals/freelancer/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  try {
    const proposals = await proposalsCollection
      .find({
        freelancerMail: email,
        status: "accepted",
      })
      .toArray();
    const taskIds = [...new Set(proposals.map((p) => new ObjectId(p.taskId)))];
    const tasks = await tasksCollection
      .find({ _id: { $in: taskIds }, status: "in-progress" })
      .toArray();
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// get payment
app.get("/api/payments", verifyToken, async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(payments);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});
// post payment
app.post("/api/payments", verifyToken, async (req, res) => {
  try {
    const payment = req.body;

    const paymentData = {
      ...payment,
      createdAt: new Date(),
    };
    const exists = await paymentsCollection.findOne({
      paymentIntentId: payment.paymentIntentId,
    });

    if (exists) {
      return res.json({
        ok: false,
        message: "Already saved",
      });
    }
    const result = await paymentsCollection.insertOne(paymentData);

    res.json({
      ok: true,
      insertedId: result.insertedId,
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});
//total revenue or transections
app.get("/api/payments/sum", verifyToken, async (req, res) => {
  try {
    const payments = await paymentsCollection.find({}).toArray();
    const total = payments.reduce(
      (sum, payment) => sum + Number(payment.amount_received),
      0,
    );
    res.json({ total });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

//get all payments
app.get("/api/payments/all", verifyToken, async (req, res) => {
  try {
    const payments = await paymentsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    res.json(payments);
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

//total amount received by a freelancer
app.get("/api/payments/total/:email", verifyToken, async (req, res) => {
  const email = req.params.email;

  try {
    const payments = await paymentsCollection
      .find({ freelancerMail: email })
      .toArray();

    const total = payments.reduce(
      (sum, payment) => sum + Number(payment.amount_received),
      0,
    );

    res.json({ total });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// change state of tasks
app.patch("/api/proposals/reject/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;
  try {
    const result = await proposalsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );
    if (result.matchedCount === 0) {
      return res
        .status(404)
        .json({ success: false, error: "Proposal not found" });
    }
    res.json({ success: true, message: "Proposal updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// find all the proposals with the same userId
app.get("/api/proposals/client/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await proposalsCollection
      .find({ clientId: id })
      .sort({ currentDate: -1 })
      .toArray();
    res.send(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
//get proposals for a task
app.get("/api/getprop/:email", verifyToken, async (req, res) => {
  const email = req.params.email;
  const result = await proposalsCollection
    .find({
      freelancerMail: email,
    })
    .toArray();
  res.json(result);
});
// delete task
app.delete("/api/tasks/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await tasksCollection.deleteOne({
      _id: new ObjectId(id),
      $sort: { createdAt: -1 },
    });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    res.json({ success: true, message: "Task deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
//patch task
app.patch("/api/tasks/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  const updateData = req.body;
  try {
    const result = await tasksCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData },
    );
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "Task not found" });
    }
    res.json({ success: true, message: "Task updated successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
//get freelancer by role
app.get("/api/user/freelancer", async (req, res) => {
  try {
    const { name, skill } = req.query;

    const filter = {
      role: "freelancer",
    };

    if (name) {
      filter.name = {
        $regex: name,
        $options: "i",
      };
    }

    if (skill) {
      filter.skills = skill;
      // or filter.skills = { $in: [skill] };
    }

    const result = await usersCollection.find(filter).toArray();

    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
// top freelancers by earnings
app.get("/api/user/freelancer/top", async (req, res) => {
  try {
    const topFreelancers = await paymentsCollection
      .aggregate([
        {
          $match: {
            status: "succeeded",
          },
        },

        {
          $group: {
            _id: "$freelancerMail",

            // Number of completed jobs
            completedTasks: {
              $sum: 1,
            },

            // Total money earned
            totalEarned: {
              $sum: "$amount_received",
            },
          },
        },

        // Sort by completed jobs first,
        // then by earnings if there's a tie
        {
          $sort: {
            completedTasks: -1,
            totalEarned: -1,
          },
        },

        {
          $limit: 6,
        },

        {
          $lookup: {
            from: "user",
            localField: "_id",
            foreignField: "email",
            as: "user",
          },
        },

        {
          $unwind: "$user",
        },

        {
          $project: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            image: "$user.image",
            bio: "$user.bio",
            skills: "$user.skills",
            hourlyRate: "$user.hourlyRate",
            role: "$user.role",
            userState: "$user.userState",

            completedTasks: 1,
            totalEarned: 1,
          },
        },
      ])
      .toArray();

    res.send(topFreelancers);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// user get
app.get("/api/user", verifyToken, async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.send(result);
});

//patch user
app.patch("/api/user/update/:id", verifyToken, async (req, res) => {
  console.log("Request body received:", req.body);
  const id = req.params.id;

  // Destructure to isolate and discard id fields if they accidentally slipped through
  const { _id, id: clientId, ...updateData } = req.body;

  try {
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }, // Now contains only clean updates like name, bio, etc.
    );

    console.log("Update result:", result);

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    res.json({ success: true, message: "User updated successfully" });
  } catch (err) {
    console.error("Database error details:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
//get user data by id
app.get("/api/user/freelancer/:id", verifyToken, async (req, res) => {
  const id = req.params.id;
  try {
    const result = await usersCollection.findOne({ _id: new ObjectId(id) });
    if (!result) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// get proposals for a task
app.get("/api/proposals/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const result = await proposalsCollection
      .find({ freelancerId: id })
      .toArray();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// post proposal
app.post("/api/proposals", verifyToken, async (req, res) => {
  const proposal = req.body;
  try {
    const result = await proposalsCollection.insertOne(proposal);
    res.json({ success: true, proposalId: result.insertedId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
// single task get
app.get("/api/open/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const result = await tasksCollection.findOne({ _id: new ObjectId(id) });

    if (!result) {
      return res.status(404).json({ error: "Task not found" });
    }

    res.json(result); // Use .json() explicitly instead of .send()
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal server error", details: error.message });
  }
});

// get open jobs
app.get("/api/open", async (req, res) => {
  try {
    const { name, skill, page = 1, limit = 9 } = req.query;

    const filter = {
      status: "Open",
      state: "accepted",
    };

    if (name) {
      filter.TaskTitle = {
        $regex: name,
        $options: "i",
      };
    }

    if (skill) {
      filter.category = skill;
    }

    // Convert string inputs to numbers
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 9;
    const skipNum = (pageNum - 1) * limitNum;

    // 1. Get total matching count for pagination UI calculation
    const totalItems = await tasksCollection.countDocuments(filter);

    // 2. Fetch data chunk
    const result = await tasksCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skipNum)
      .limit(limitNum)
      .toArray();

    // Return both pieces of metadata
    res.send({ tasks: result, totalItems });
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});
// get open task
app.get("/api/open/feature/open/task", async (req, res) => {
  try {
    const result = await tasksCollection
      .find({ status: "Open", state: "accepted" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

// posts jobs

app.post("/api/tasks", verifyToken, async (req, res) => {
  try {
    const task = req.body;
    const result = await tasksCollection.insertOne(task);
    res.json({ success: true, taskId: result.insertedId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// get jobs for client
app.get("/api/tasks/get", verifyToken, async (req, res) => {
  const result = await tasksCollection.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

// await client.db("admin").command({ ping: 1 });
// console.log(
//   "Pinged your deployment. You successfully connected to MongoDB!",
// );
//   } finally {
//     // Ensures that the client will close when you finish/error
//     // await client.close();
//   }
// }
// run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
