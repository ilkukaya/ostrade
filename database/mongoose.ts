import mongoose from "mongoose";
import dns from 'dns';

const MONGODB_URI = process.env.MONGODB_URI;

// Some restrictive/sandboxed networks can't resolve the SRV record an Atlas
// `mongodb+srv://` URI needs (`querySrv ECONNREFUSED`). This is a process-wide
// DNS setting — it applies to every outbound request this server makes, not
// only MongoDB — so if a deploy target ever behaves oddly here (e.g. an
// outbound network policy that only allows its own resolver), this is the
// first place to look. See docs/deployment-netlify.md's MongoDB Atlas section.
try {
    if (dns.setDefaultResultOrder) {
        dns.setDefaultResultOrder('ipv4first');
    }
    dns.setServers(['8.8.8.8']);
} catch (e) {
    console.error('Failed to apply custom DNS settings:', e);
}

declare global {
    var mongooseCache: {
        conn: typeof mongoose | null;
        promise: Promise<typeof mongoose> | null;
    }
}

let cached = global.mongooseCache;

if (!cached) {
    cached = global.mongooseCache = { conn: null, promise: null };
}

export const connectToDatabase = async () => {
    if (!MONGODB_URI) {
        throw new Error("MongoDB URI is missing");
    }

    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false, family: 4 });
    }

    try {
        cached.conn = await cached.promise;
    }
    catch (err) {
        cached.promise = null;
        throw err;
    }

    // Never log MONGODB_URI itself — it carries the database user's
    // credentials in its userinfo section (mongodb+srv://user:pass@...).
    console.log(`MongoDB connected (${process.env.NODE_ENV})`);
    return cached.conn;
}