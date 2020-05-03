#include "stdio.h"
#include <openssl/evp.h>
#include <openssl/conf.h>

// STD Library

// #include ""

void XOR(unsigned char* a, unsigned char* b, unsigned int len, unsigned char*c) {
    for (unsigned int i = 0; i < len; ++i) {
        c[i] = a[i] ^ b[i];
    }
}

void OR(unsigned char* a, unsigned char* b, unsigned int len, unsigned char*c) {
    for (unsigned int i = 0; i < len; ++i) {
        c[i] = a[i] | b[i];
    }
}

void AND(unsigned char* a, unsigned char* b, unsigned int len, unsigned char*c) {
    for (unsigned int i = 0; i < len; ++i) {
        c[i] = a[i] & b[i];
    }
}

void NOT(unsigned char* a, unsigned int len, unsigned char* b) {
    for (unsigned int i = 0; i < len; ++i) {
        b[i] = ~a[i];
    }
}

void LSHIFT(unsigned char* a, unsigned int b, unsigned int len, unsigned char*c) {
    unsigned int j, s, bc;
    bc = b;
    for (unsigned int i = 0; i < len; ++i) {
        c[i] = a[i];
        j = i;
        b = bc;
        while (b > 0) {
            if (b > 8) s = 8;
            else s = b;
            if (j + 1 < len) {
                c[i] = ((c[i] << s) & 0xff) | (a[j + 1] >> (8 - s));
                ++j;
            }
            else {
                c[i] = (c[i] << s);
            }
            b -= s;
        }
    }
}

void RSHIFT(unsigned char* a, unsigned int b, unsigned int len, unsigned char*c) {
    unsigned int j, s, bc;
    bc = b;
    for (unsigned int i = 0; i < len; ++i) {
        c[i] = a[i];
        j = i;
        b = bc;
        while (b > 0) {
            if (b > 8) s = 8;
            else s = b;
            if (j > 0) {
                c[i] = (c[i] >> s) | (a[j - 1] << (8 - s));
                --j;
            }
            else {
                c[i] = (c[i] >> s);
            }
            b -= s;
        }
    }
}

int EQ(unsigned char* a, unsigned char* b, unsigned int len) {
    for (unsigned int i = 0; i < len; ++i) {
        if (a[i] != b[i]) return 0;
    }
    return 1;
}

int DEQ(unsigned char* a, unsigned char* b, unsigned int len) {
    for (unsigned int i = 0; i < len; ++i) {
        if (a[i] == b[i]) return 0;
    }
    return 1;
}

void ADD(unsigned char* a, unsigned char* b, unsigned int len, unsigned char* c) {
    // Memset
    printf("%d", len);
    for (unsigned int i = 0; i < len; ++i) {
        c[i] = 0;
    }
    // Add (least significant onwards)
    unsigned char carry = 0;
    for (unsigned int i = len - 1; i >= 0; --i) {
        unsigned int sum = ((unsigned int)carry + (unsigned int)a[i] + (unsigned int)b[i]);
        carry = (sum >> 8) & 0x01;
        c[i] = sum & 0xFF;
    } 
}

void handleErrors(void)
{
    printf("Errors\n");
    abort();
}

int tk_AES_encrypt(unsigned char *plaintext, int plaintext_len, unsigned char *key,
            unsigned char *iv, unsigned char *ciphertext)
{
    EVP_CIPHER_CTX *ctx;

    int len;

    int ciphertext_len;

    /* Create and initialise the context */
    if(!(ctx = EVP_CIPHER_CTX_new()))
        handleErrors();

    /*
     * Initialise the encryption operation. IMPORTANT - ensure you use a key
     * and IV size appropriate for your cipher
     * In this example we are using 256 bit AES (i.e. a 256 bit key). The
     * IV size for *most* modes is the same as the block size. For AES this
     * is 128 bits
     */
    if(1 != EVP_EncryptInit_ex(ctx, EVP_aes_128_cbc(), NULL, key, iv))
        handleErrors();

    /*
     * Provide the message to be encrypted, and obtain the encrypted output.
     * EVP_EncryptUpdate can be called multiple times if necessary
     */
    if(1 != EVP_EncryptUpdate(ctx, ciphertext, &len, plaintext, plaintext_len))
        handleErrors();
    ciphertext_len = len;

    /*
     * Finalise the encryption. Further ciphertext bytes may be written at
     * this stage.
     */
    if(1 != EVP_EncryptFinal_ex(ctx, ciphertext + len, &len))
        handleErrors();
    ciphertext_len += len;

    /* Clean up */
    EVP_CIPHER_CTX_free(ctx);

    return ciphertext_len;
}