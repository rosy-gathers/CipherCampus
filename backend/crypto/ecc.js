// Simplified ECC Implementation for faster key generation
class ECC {
    constructor() {
        // Simple curve for testing
        this.p = 23;
        this.a = 1;
        this.b = 1;
        this.G = { x: 5, y: 7 };
    }

    // Modular inverse
    inverseMod(k, p) {
        let [oldR, r] = [k, p];
        let [oldS, s] = [1, 0];
        
        while (r !== 0) {
            const quotient = Math.floor(oldR / r);
            [oldR, r] = [r, oldR - quotient * r];
            [oldS, s] = [s, oldS - quotient * s];
        }
        
        let result = oldS % p;
        while (result < 0) result += p;
        return result;
    }

    // Point addition
    pointAdd(P, Q) {
        if (P === null) return Q;
        if (Q === null) return P;
        
        const { x: x1, y: y1 } = P;
        const { x: x2, y: y2 } = Q;
        
        if (x1 === x2 && (y1 + y2) % this.p === 0) {
            return null;
        }
        
        let m;
        if (P !== Q) {
            const diffX = (x2 - x1 + this.p) % this.p;
            const diffY = (y2 - y1 + this.p) % this.p;
            m = (diffY * this.inverseMod(diffX, this.p)) % this.p;
        } else {
            const numerator = (3 * x1 * x1 + this.a) % this.p;
            const denominator = (2 * y1) % this.p;
            m = (numerator * this.inverseMod(denominator, this.p)) % this.p;
        }
        
        const x3 = (m * m - x1 - x2) % this.p;
        const y3 = (m * (x1 - x3) - y1) % this.p;
        
        return {
            x: x3 < 0 ? x3 + this.p : x3,
            y: y3 < 0 ? y3 + this.p : y3
        };
    }

    // Scalar multiplication
    scalarMult(k, P) {
        let result = null;
        let Q = { ...P };
        let scalar = Math.floor(Number(k));
        if (!Number.isFinite(scalar) || scalar < 0) {
            throw new Error('Invalid ECC scalar');
        }
        
        while (scalar > 0) {
            if (scalar & 1) {
                result = this.pointAdd(result, Q);
            }
            Q = this.pointAdd(Q, Q);
            scalar = scalar >> 1;
        }
        
        return result;
    }

    // Generate key pair
    generateKeyPair() {
        const privateKey = 2 + Math.floor(Math.random() * (this.p - 3));
        const publicKey = this.scalarMult(privateKey, this.G);
        
        return {
            privateKey: privateKey,
            publicKey: publicKey
        };
    }

    generateSharedSecret(privateKey, otherPublicKey) {
        const sharedPoint = this.scalarMult(Math.floor(Number(privateKey)), otherPublicKey);
        return sharedPoint ? sharedPoint.x : null;
    }

    encrypt(message, recipientPublicKey) {
        const ephemeral = this.generateKeyPair();
        const sharedSecret = this.generateSharedSecret(
            Math.floor(Number(ephemeral.privateKey)),
            recipientPublicKey
        );
        
        let encrypted = '';
        const secret = sharedSecret.toString();
        for (let i = 0; i < message.length; i++) {
            encrypted += String.fromCharCode(message.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
        }
        
        return {
            ciphertext: encrypted,
            ephemeralPublicKey: ephemeral.publicKey
        };
    }

    decrypt(encryptedData, privateKey) {
        const { ciphertext, ephemeralPublicKey } = encryptedData;
        const sk = Math.floor(Number(privateKey));
        const sharedSecret = this.generateSharedSecret(sk, ephemeralPublicKey);
        
        let decrypted = '';
        const secret = sharedSecret.toString();
        for (let i = 0; i < ciphertext.length; i++) {
            decrypted += String.fromCharCode(ciphertext.charCodeAt(i) ^ secret.charCodeAt(i % secret.length));
        }
        
        return decrypted;
    }

    pointToString(point) {
        if (point === null) return 'null';
        return `${point.x},${point.y}`;
    }

    stringToPoint(str) {
        if (str === 'null') return null;
        const [x, y] = str.split(',').map(Number);
        return { x, y };
    }
}

module.exports = ECC;