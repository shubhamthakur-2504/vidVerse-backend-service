import { MongoMemoryServer } from "mongodb-memory-server";

// one in-memory MongoDB for the whole run; its uri is handed to every test file via inject("mongoUri")
let mongod;

export async function setup({ provide }) {
    mongod = await MongoMemoryServer.create();
    provide("mongoUri", mongod.getUri());
}

export async function teardown() {
    await mongod?.stop();
}
