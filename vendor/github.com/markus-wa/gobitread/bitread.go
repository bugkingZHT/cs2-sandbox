// Package bitread provides a bit level reader.
package bitread

// TODO: len(BitReader.buffer) must be a multiple of 'sled' and > 2*'sled' for the BitReader to work, this shouldn't be necessary?

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

const (
	sled     = 8
	sledMask = sled - 1
	sledBits = sled << 3
)

// A simple int stack.
type stack []int

// push returns a stack with the value v added on top of the original stack.
func (s stack) push(v int) stack {
	return append(s, v)
}

// pop removes the last added item from the stack.
// Returns the new stack and the item that was removed.
// Attention: panics when the stack is empty!
func (s stack) pop() (stack, int) {
	// FIXME: CBA to handle empty stacks rn
	l := len(s)
	return s[:l-1], s[l-1]
}

// top returns the top element without removing it.
func (s stack) top() int {
	return s[len(s)-1]
}

// BitReader wraps an io.Reader and provides methods to read from it on the bit level.
type BitReader struct {
	underlying   io.Reader
	buffer       []byte
	offset       int
	bitsInBuffer int
	lazyPosition int
	chunkTargets stack
	endReached   bool
}

// LazyPosition returns the offset at the time of the last time the buffer was refilled.
func (r *BitReader) LazyPosition() int {
	return r.lazyPosition
}

// ActualPosition returns the offset from the start in bits.
func (r *BitReader) ActualPosition() int {
	return r.lazyPosition + r.offset
}

// Open sets the underlying io.Reader and internal buffer, making the reader ready to use.
// bufferSize is in bytes, must be a multiple of 8 and > 16.
func (r *BitReader) Open(underlying io.Reader, bufferSize int) {
	r.OpenWithBuffer(underlying, make([]byte, bufferSize))
}

// OpenWithBuffer is like Open but allows to provide the internal byte buffer.
// Could be useful to pool buffers of short living BitReaders for example.
// len(buffer) must be a multiple of 8 and > 16.
func (r *BitReader) OpenWithBuffer(underlying io.Reader, buffer []byte) {
	if len(buffer)&sledMask != 0 {
		panic(fmt.Sprintf("Buffer must be a multiple of %d", sled))
	}
	if len(buffer) <= sled<<1 {
		panic(fmt.Sprintf("Buffer must be larger than %d bytes", sled<<1))
	}

	r.endReached = false
	r.underlying = underlying
	r.buffer = buffer

	// Initialize buffer
	bytes, err := r.underlying.Read(r.buffer)
	if err != nil {
		panic(err)
	}

	r.bitsInBuffer = (bytes << 3) - sledBits
	if r.bitsInBuffer < 0 {
		// All bytes read already
		r.bitsInBuffer += sledBits
	}
}

// Close resets the BitReader. Open() may be used again after Close().
func (r *BitReader) Close() error {
	if closeable, ok := r.underlying.(io.ReadCloser); ok {
		return closeable.Close()
	}

	r.underlying = nil
	r.buffer = nil
	r.offset = 0
	r.bitsInBuffer = 0
	r.chunkTargets = stack{}
	r.lazyPosition = 0

	return nil
}

// ReadBit reads a single bit.
func (r *BitReader) ReadBit() bool {
	res := (r.buffer[r.offset>>3] & (1 << uint(r.offset&7))) != 0
	r.advance(1)
	return res
}

// ReadBits reads n bits into a []byte.
func (r *BitReader) ReadBits(n int) []byte {
	b := make([]byte, (n+7)>>3)
	bitLevel := r.offset&7 != 0
	for i := 0; i < n>>3; i++ {
		b[i] = r.readByteInternal(bitLevel)
	}
	if n&7 != 0 {
		b[n>>3] = r.ReadBitsToByte(n & 7)
	}
	return b
}

// ReadSingleByte reads one byte.
// Not called ReadByte as it does not comply with the standard library interface.
func (r *BitReader) ReadSingleByte() byte {
	return r.readByteInternal(r.offset&7 != 0)
}

func (r *BitReader) readByteInternal(bitLevel bool) byte {
	if !bitLevel {
		res := r.buffer[r.offset>>3]
		r.advance(8)
		return res
	}
	return r.ReadBitsToByte(8)
}

// ReadBitsToByte reads n bits into a byte.
// Undefined for n > 8.
func (r *BitReader) ReadBitsToByte(n int) byte {
	return byte(r.ReadInt(n))
}

// ReadInt reads the next n bits as an int.
// Undefined for n > 32.
func (r *BitReader) ReadInt(n int) uint {
	byteIndex := r.offset >> 3
	bitOffset := r.offset & 7

	val := binary.LittleEndian.Uint64(r.buffer[byteIndex:])

	res := uint(val>>bitOffset) & ((1 << n) - 1)

	r.offset += n
	if r.offset > r.bitsInBuffer {
		r.refillBuffer()
	}

	return res
}

// ReadBytes reads n bytes.
// Ease of use wrapper for ReadBytesInto().
func (r *BitReader) ReadBytes(n int) []byte {
	res := make([]byte, 0, n)
	r.ReadBytesInto(&res, n)
	return res
}

// ReadBytesInto reads n bytes into out.
// Useful for pooling []byte slices.
func (r *BitReader) ReadBytesInto(out *[]byte, n int) {
	bitLevel := r.offset&7 != 0
	if !bitLevel && r.offset+(n<<3) <= r.bitsInBuffer {
		// Shortcut if offset%8 = 0 and all bytes are already buffered
		*out = append(*out, r.buffer[r.offset>>3:(r.offset>>3)+n]...)
		r.advance(n << 3)
	} else {
		for i := 0; i < n; i++ {
			*out = append(*out, r.readByteInternal(bitLevel))
		}
	}
}

// ReadCString reads n bytes as characters into a string.
// The string is terminated by zero.
func (r *BitReader) ReadCString(n int) string {
	b := r.ReadBytes(n)
	end := bytes.IndexByte(b, 0)
	if end < 0 {
		end = n
	}
	return string(b[:end])
}

// ReadSignedInt is like ReadInt but returns signed int.
// Undefined for n > 32.
func (r *BitReader) ReadSignedInt(n int) int {
	val := binary.LittleEndian.Uint64(r.buffer[r.offset>>3&^3:])
	// Cast to int64 before right shift & use offset before advance
	res := int(int64(val<<uint(64-(r.offset&31)-n)) >> (64 - uint(n)))
	r.advance(n)
	return res
}

// BeginChunk starts a new chunk with n bits.
// Useful to make sure the position in the bit stream is correct.
func (r *BitReader) BeginChunk(n int) {
	r.chunkTargets = r.chunkTargets.push(r.ActualPosition() + n)
}

// EndChunk attempts to 'end' the last chunk.
// Seeks to the end of the chunk if not already reached.
// Panics if the chunk boundary was exceeded while reading.
func (r *BitReader) EndChunk() {
	var target int
	r.chunkTargets, target = r.chunkTargets.pop()
	delta := target - r.ActualPosition()
	if delta < 0 {
		panic("Someone read beyond a chunk boundary, what a dick")
	} else if delta > 0 {
		r.Skip(delta)
	}
	if target != r.ActualPosition() {
		panic(fmt.Sprintf("Skipping data failed, expected position %d got %d", target, r.ActualPosition()))
	}
}

// ChunkFinished returns true if the current position is at the end of the chunk.
func (r *BitReader) ChunkFinished() bool {
	return r.chunkTargets.top() <= r.ActualPosition()
}

// Skip skips n bits.
func (r *BitReader) Skip(n int) {
	// Seek for the end of the chunk
	bufferBits := r.bitsInBuffer - r.offset
	seeker, ok := r.underlying.(io.Seeker)
	if n > bufferBits+sledBits && ok {
		// Seek with io.Seeker
		unbufferedSkipBits := n - bufferBits
		globalOffset, err := seeker.Seek(int64((unbufferedSkipBits>>3)-sled), io.SeekCurrent)
		if err != nil {
			panic(err)
		}
		r.lazyPosition = int(globalOffset) << 3

		newBytes, err := r.underlying.Read(r.buffer)
		if err != nil {
			panic(err)
		}
		r.offset = unbufferedSkipBits & sledMask

		r.bitsInBuffer = (newBytes << 3) - sledBits
		if newBytes <= sled {
			// TODO: Maybe do this even if newBytes is <= bufferSize - sled like in refillBuffer
			// Consume sled
			// Shouldn't really happen unless we reached the end of the stream
			// In that case bitsInBuffer should be 0 after this line (newBytes=0 - sled + sled)
			r.bitsInBuffer += sledBits
		}
	} else {
		// Can't seek or no seek necessary
		r.advance(n)
	}
}

func (r *BitReader) advance(bits int) {
	r.offset += bits
	for r.offset > r.bitsInBuffer {
		// Refill if we reached the sled
		r.refillBuffer()
	}
}

func (r *BitReader) refillBuffer() {
	// Copy sled to beginning
	copy(r.buffer[0:sled], r.buffer[r.bitsInBuffer>>3:(r.bitsInBuffer>>3)+sled])

	r.offset -= r.bitsInBuffer // Sled bits used remain in offset
	r.lazyPosition += r.bitsInBuffer

	newBytes, err := r.underlying.Read(r.buffer[sled:])
	r.bitsInBuffer = newBytes << 3

	if err != nil {
		if errors.Is(err, io.EOF) {
			if r.endReached {
				// Read beyond end of underlying Reader
				panic(io.ErrUnexpectedEOF)
			}
			// We're done here, consume sled
			r.bitsInBuffer += sledBits
			r.endReached = true
		} else {
			panic(err)
		}
	}
}
