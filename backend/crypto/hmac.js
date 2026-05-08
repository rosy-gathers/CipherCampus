// HMAC Implementation from scratch following CBC_MAC.ipynb pattern
class HMAC {
    constructor(key, hashFunction = 'sha256') {
        this.key = key;
        this.hashFunction = hashFunction;
        this.blockSize = 64; // bytes for SHA-256
    }

    // Simple SHA-256 implementation (from scratch)
    sha256(message) {
        // SHA-256 constants
        const K = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
            0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
            0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
            0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
            0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
            0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
            0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
        ];
        
        // Initial hash values
        let H = [
            0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
            0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
        ];
        
        // Convert message to binary
        let msgBits = '';
        for (let i = 0; i < message.length; i++) {
            msgBits += message.charCodeAt(i).toString(2).padStart(8, '0');
        }
        
        // Append '1' bit
        msgBits += '1';
        
        // Append zeros
        while (msgBits.length % 512 !== 448) {
            msgBits += '0';
        }
        
        // Append original length
        const originalLength = message.length * 8;
        msgBits += originalLength.toString(2).padStart(64, '0');
        
        // Process each 512-bit chunk
        for (let i = 0; i < msgBits.length; i += 512) {
            const chunk = msgBits.substr(i, 512);
            const words = [];
            
            // Break into 32-bit words
            for (let j = 0; j < 512; j += 32) {
                words.push(parseInt(chunk.substr(j, 32), 2));
            }
            
            // Extend to 64 words
            for (let j = 16; j < 64; j++) {
                const s0 = this.rotateRight(words[j-15], 7) ^ this.rotateRight(words[j-15], 18) ^ (words[j-15] >>> 3);
                const s1 = this.rotateRight(words[j-2], 17) ^ this.rotateRight(words[j-2], 19) ^ (words[j-2] >>> 10);
                words[j] = (words[j-16] + s0 + words[j-7] + s1) >>> 0;
            }
            
            // Initialize working variables
            let [a, b, c, d, e, f, g, h] = H;
            
            // Compression loop
            for (let j = 0; j < 64; j++) {
                const S1 = this.rotateRight(e, 6) ^ this.rotateRight(e, 11) ^ this.rotateRight(e, 25);
                const ch = (e & f) ^ ((~e) & g);
                const temp1 = (h + S1 + ch + K[j] + words[j]) >>> 0;
                const S0 = this.rotateRight(a, 2) ^ this.rotateRight(a, 13) ^ this.rotateRight(a, 22);
                const maj = (a & b) ^ (a & c) ^ (b & c);
                const temp2 = (S0 + maj) >>> 0;
                
                h = g;
                g = f;
                f = e;
                e = (d + temp1) >>> 0;
                d = c;
                c = b;
                b = a;
                a = (temp1 + temp2) >>> 0;
            }
            
            // Update hash values
            H = [
                (H[0] + a) >>> 0, (H[1] + b) >>> 0, (H[2] + c) >>> 0, (H[3] + d) >>> 0,
                (H[4] + e) >>> 0, (H[5] + f) >>> 0, (H[6] + g) >>> 0, (H[7] + h) >>> 0
            ];
        }
        
        // Produce final hash
        let hash = '';
        for (let i = 0; i < H.length; i++) {
            hash += H[i].toString(16).padStart(8, '0');
        }
        
        return hash;
    }
    
    rotateRight(value, shift) {
        return ((value >>> shift) | (value << (32 - shift))) >>> 0;
    }
    
    // Generate HMAC as per CBC-MAC pattern
    generateHMAC(message) {
        let key = this.key;
        
        // If key is longer than block size, hash it
        if (key.length > this.blockSize) {
            key = this.sha256(key);
        }
        
        // Pad key to block size
        while (key.length < this.blockSize) {
            key += '\0';
        }
        
        // Create inner and outer pads
        let innerPad = '';
        let outerPad = '';
        for (let i = 0; i < this.blockSize; i++) {
            innerPad += String.fromCharCode(key.charCodeAt(i) ^ 0x36);
            outerPad += String.fromCharCode(key.charCodeAt(i) ^ 0x5c);
        }
        
        // HMAC = H(outerPad || H(innerPad || message))
        const innerHash = this.sha256(innerPad + message);
        const hmac = this.sha256(outerPad + innerHash);
        
        return hmac;
    }
    
    // Verify HMAC
    verifyHMAC(message, receivedHMAC) {
        const computedHMAC = this.generateHMAC(message);
        return computedHMAC === receivedHMAC;
    }
}

// Expose a standalone SHA-256 helper that reuses the from-scratch implementation
// inside the HMAC class, so the rest of the codebase never has to call into
// Node's built-in `crypto` module for hashing.
const _sha256Helper = new HMAC('');
HMAC.sha256 = (message) => _sha256Helper.sha256(String(message));

module.exports = HMAC;