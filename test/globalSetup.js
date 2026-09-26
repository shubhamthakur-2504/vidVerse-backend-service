import { MongoMemoryServer } from "mongodb-memory-server";

// one in-memory MongoDB for the whole run; its uri is handed to every test file via inject("mongoUri")
let mongod;

export async function setup({ provide }) {
    // generous start-up allowance: the default 10s is too tight on a busy machine
    mongod = await MongoMemoryServer.create({ instance: { launchTimeout: 60000 } });
    provide("mongoUri", mongod.getUri());
}

export async function teardown() {
    await mongod?.stop();
}
