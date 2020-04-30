// #include "stdio.h"
// STD Library

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

// void bin(unsigned n, int i) 
// { 
//     /* step 1 */
//     if (i > 1) 
//         bin(n/2, i - 1); 
  
//     /* step 2 */
//     printf("%d", n % 2); 
// } 

// void print_hex(const unsigned char *s, int l)
// {
//   while(l) {
//     bin((unsigned int) *s++, 8);
//     printf(" ");
//     --l;
//   }
//   printf("\n");
// }

// int main() {
//     unsigned char * string = "tebby";
//     unsigned char shifted[6];
//     unsigned char rshifted[6];
//     LSHIFT(string, 3, 5, shifted);
//     RSHIFT(string, 3, 5, rshifted);
//     shifted[5] = 0;
//     print_hex(string, 5);
//     print_hex(shifted, 5);
//     print_hex(rshifted, 5);
// }