const winston = require("winston");
const { MongoClient } = require("mongodb");

class MongoDBDispatcher extends winston.Transport {
  constructor(options) {
    super();

    this.options = options;

    this.url = `mongodb://${this.options.mongodbUser}:${this.options.mongodbPassword}@${this.options.mongodbHost}:${this.options.mongodbPort}/`;
    this.dbName = this.options.mongodbDatabase;
    this.collectionName = `${this.options.mongodbCollectionName}_telemetry`;
    this.client = null;
    this.db = null;
    this.collection = null;

    (async () => {
      try {
        this.client = await MongoClient.connect(this.url, {});

        console.log("MongoDB Connected!");
        this.db = this.client.db(this.dbName);

        const collections = await this.db
          .listCollections({ name: this.collectionName })
          .toArray();
        if (collections.length === 0) {
          await this.db.createCollection(this.collectionName);
          console.log(
            `Collection '${this.collectionName}' created successfully`
          );
        } else {
          console.log(`Collection '${this.collectionName}' already exists`);
        }

        this.collection = this.db.collection(this.collectionName);

        // Create indexes if they do not exist
        await this.collection.createIndexes([
          { key: { api_id: 1 } },
          { key: { ver: 1 } },
          { key: { ets: 1 } },
          { key: { syncts: 1 } },
        ]);
        console.log("Indexes created successfully");
      } catch (err) {
        console.error("MongoDB Connection Error", err);
        throw err;
      }
    })();
  }
  async log(level, msg, meta, callback) {
    let message = msg;
    if (typeof message === "string") {
      try {
        message = JSON.parse(message);
      } catch (err) {
        console.error("Failed to parse message", err);
        return callback(err);
      }
    }

    const promises = [];

    try {
      for (const event of message.msg.events) {
        const pid = event.context.pdata ? event.context.pdata.pid : undefined;
        promises.push(
          this.collection.insertOne({
            api_id: message.id,
            ver: message.ver,
            params: message.params,
            ets: message.ets,
            events: event,
            channel: event.context.channel,
            pid: pid,
            mid: message.mid,
            syncts: message.syncts,
          })
        );
      }
    } catch (err) {
      return callback(err);
    }

    try {
      await Promise.all(promises);
      console.log("Data inserted successfully!");
      callback(); // Invoke callback indicating success
    } catch (err) {
      console.error("Unable to insert data into MongoDB", err);
      callback(err); // Invoke callback with error
    }
  }
}

// Register MongoDBDispatcher with Winston
winston.transports.mongodb = MongoDBDispatcher;

module.exports = MongoDBDispatcher;
