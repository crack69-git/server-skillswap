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
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    const database = client.db("skillswap");
    const tasksCollection = database.collection("tasks");
    const proposalsCollection = database.collection("proposals");
    const usersCollection = database.collection("user");

    // change state of tasks
    app.patch("/api/proposals/:id", async (req, res) => {
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
    app.get("/api/proposals/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const result = await proposalsCollection
          .find({ clientId: id })
          .toArray();
        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    //get proposals for a task
    app.get("/api/getprop/:email", async (req, res) => {
      const email = req.params.email;
      const result = await proposalsCollection
        .find({
          freelancerMail: email,
        })
        .toArray();
      res.json(result);
    });
    // delete task
    app.delete("/api/tasks/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, error: "Task not found" });
        }
        res.json({ success: true, message: "Task deleted successfully" });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    //patch task
    app.patch("/api/tasks/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      try {
        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, error: "Task not found" });
        }
        res.json({ success: true, message: "Task updated successfully" });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // user get
    app.get("/api/user", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    //patch user
    app.patch("/api/user/:id", async (req, res) => {
      const id = req.params.id;
      const updateData = req.body;
      try {
        const result = await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateData },
        );
        if (result.matchedCount === 0) {
          return res
            .status(404)
            .json({ success: false, error: "User not found" });
        }
        res.json({ success: true, message: "User updated successfully" });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // get proposals for a task
    app.get("/api/proposals/:id", async (req, res) => {
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
    app.post("/api/proposals", async (req, res) => {
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
      const result = await tasksCollection
        .find({ status: "Open", state: "accepted" })
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });
    // posts jobs
    app.post("/api/tasks", async (req, res) => {
      try {
        const task = req.body;
        const result = await tasksCollection.insertOne(task);
        res.json({ success: true, taskId: result.insertedId });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // get jobs for client
    app.get("/api/tasks", async (req, res) => {
      const result = await tasksCollection
        .find()
        .sort({ createdAt: -1 })
        .toArray();
      res.send(result);
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!",
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
