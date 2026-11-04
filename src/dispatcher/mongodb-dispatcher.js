const winston = require("winston");
const { MongoClient } = require("mongodb");
class MongoDBDispatcher extends winston.Transport {
  constructor(options) {
    super();

    this.options = options;

    this.url = `${this.options.mongodbConnectionUrl}`;
    this.dbName = this.options.mongodbDatabase;
    this.collectionName = `${this.options.mongodbCollectionPrefix}_telemetry`;
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
  isHealthy() {
    return this.client !== null && this.collection !== null;
  }

  async log(level, msg, meta, callback) {
    let message = msg;
    if (typeof message === "string") {
      try {
        message = JSON.parse(msg);
      } catch (err) {
        console.error("Failed to parse message", err);
        return callback(err);
      }
    }

    const promises = [];

    try {    
      // Prepare the array of documents to be inserted
      const documents = message.events.map(event => {
        const pid = event.context.pdata ? event.context.pdata.pid : undefined;
        if(message.version === 'v2' || message.version === 'v3') {
          event.actor.id = message.userId
          event.context.uid = message.userId
          event.context.cdata = event.context.cdata
          .map((cdataEle) => {
            if (cdataEle.type === "Buddy User") {
              cdataEle.id = "anonymous";
            }
            if(cdataEle.type === "User" || cdataEle.type === "virtualId") {
              cdataEle.id = message.userId;
            }
            return cdataEle;
          });
        }
        return {
          api_id: message.id,
          ver: message.ver,
          params: message.params,
          ets: message.ets,
          createdAt: new Date(),
          events: event,
          channel: event.context.channel,
          pid: pid,
          mid: message.mid,
          syncts: message.syncts,
        };
      });
    
      // Use insertMany to insert all the documents at once
      await this.collection.insertMany(documents);
    } catch (err) {
      return callback(err);
    }
    

    if (
      process.env.UrlForAnonymousDataToALL &&
      process.env.sendAnonymousDataToALL === "yes"
    ) {
      let anonymousEventsArr = message.events
        .filter((event) => {
          if (event.eid === "LOG" && event.edata.type === "api_login_call") {
            return false; // skip
          }
          return true;
        })
        .map((event) => {
          event.context.uid = "anonymous";
          event.context.cdata = event.context.cdata
            .filter((cdataEle) => {
              if (
                cdataEle.type === "school_name" ||
                cdataEle.type === "class_studying_id" ||
                cdataEle.type === "udise_code"
              ) {
                return false; // skip
              }
              return true;
            })
            .map((cdataEle) => {
              if (cdataEle.type === "Buddy User") {
                cdataEle.id = "anonymous";
              }
              return cdataEle;
            });
          return event;
        });

      message.events = anonymousEventsArr;

      try {
        const response = await fetch(process.env.UrlForAnonymousDataToALL, {
          method: "POST",
          body: JSON.stringify(message),
          headers: { "Content-Type": "application/json" },
        });
        if (response.status === 200 || response.status === 201) {
          console.log("Data logged into ALL telemetry");
        } else {
          console.log("Data is not logged into ALL telemetry");
        }
      } catch (err) {
        console.error("Unable to insert data into MongoDB", err);
      }
    }

    callback();
  }
}
winston.transports.mongodb = MongoDBDispatcher;

module.exports = MongoDBDispatcher;
