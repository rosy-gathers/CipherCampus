// Optimized RSA Implementation for faster key generation
class RSA {
    constructor() {
        this.p = null;
        this.q = null;
        this.n = null;
        this.phi = null;
        this.e = 65537;
        this.d = null;
    }

    // Simple primality test for small primes (fast enough for testing)
    isPrime(n) {
        if (n <= 1) return false;
        if (n <= 3) return true;
        if (n % 2 === 0 || n % 3 === 0) return false;
        
        for (let i = 5; i * i <= n; i += 6) {
            if (n % i === 0 || n % (i + 2) === 0) return false;
        }
        return true;
    }

    // Generate prime using simple method (faster for testing)
    generatePrime(bits) {
        const min = Math.pow(2, bits - 1);
        const max = Math.pow(2, bits) - 1;
        
        // eslint-disable-next-line no-constant-condition -- intentional prime search loop
        while (true) {
            const num = Math.floor(Math.random() * (max - min + 1)) + min;
            if (num % 2 !== 0 && this.isPrime(num)) {
                return num;
            }
        }
    }

    // Modular exponentiation
    modPow(base, exponent, modulus) {
        if (modulus === 1) return 0;
        let result = 1n;
        let b = BigInt(base);
        let e = BigInt(exponent);
        let m = BigInt(modulus);
        
        b = b % m;
        while (e > 0) {
            if (e % 2n === 1n) {
                result = (result * b) % m;
            }
            b = (b * b) % m;
            e = e >> 1n;
        }
        return Number(result);
    }

    // Extended Euclidean Algorithm
    modInverse(a, m) {
        let [oldR, r] = [a, m];
        let [oldS, s] = [1, 0];
        let [oldT, t] = [0, 1];
        
        while (r !== 0) {
            const quotient = Math.floor(oldR / r);
            [oldR, r] = [r, oldR - quotient * r];
            [oldS, s] = [s, oldS - quotient * s];
            [oldT, t] = [t, oldT - quotient * t];
        }
        
        let result = oldS % m;
        while (result < 0) result += m;
        return result;
    }

    gcd(a, b) {
        while (b !== 0) {
            let temp = b;
            b = a % b;
            a = temp;
        }
        return a;
    }

    // Generate RSA key pair (optimized)
    generateKeyPair() {
        console.log("Generating RSA keys...");
        
        // Use smaller primes for testing (faster)
        this.p = this.generatePrime(16); // 16-bit prime
        this.q = this.generatePrime(16); // 16-bit prime
        
        while (this.p === this.q) {
            this.q = this.generatePrime(16);
        }
        
        this.n = this.p * this.q;
        this.phi = (this.p - 1) * (this.q - 1);
        
        // Find e
        this.e = 65537;
        while (this.gcd(this.e, this.phi) !== 1) {
            this.e += 2;
        }
        
        // Calculate d
        this.d = this.modInverse(this.e, this.phi);
        
        console.log("RSA keys generated successfully");
        
        return {
            publicKey: { e: this.e, n: this.n },
            privateKey: { d: this.d, n: this.n }
        };
    }

    // Encrypt with public key
    encrypt(message, publicKey) {
        const encrypted = [];
        for (let i = 0; i < message.length; i++) {
            const m = message.charCodeAt(i);
            const c = this.modPow(m, publicKey.e, publicKey.n);
            encrypted.push(c.toString());
        }
        return encrypted.join(',');
    }

    // Decrypt with private key
    decrypt(ciphertext, privateKey) {
        if (!ciphertext) return '';
        const parts = ciphertext.split(',');
        let decrypted = '';
        for (let i = 0; i < parts.length; i++) {
            if (!parts[i]) continue;
            const c = parseInt(parts[i]);
            const m = this.modPow(c, privateKey.d, privateKey.n);
            decrypted += String.fromCharCode(Number(m));
        }
        return decrypted;
    }
}

module.exports = RSA;