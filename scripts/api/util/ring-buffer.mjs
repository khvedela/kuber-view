export class RingBuffer {
  #buf;
  #head = 0;
  #size = 0;
  #cap;

  constructor(capacity) {
    this.#cap = capacity;
    this.#buf = new Array(capacity);
  }

  push(item) {
    this.#buf[this.#head] = item;
    this.#head = (this.#head + 1) % this.#cap;
    if (this.#size < this.#cap) this.#size++;
  }

  toArray() {
    if (this.#size < this.#cap) return this.#buf.slice(0, this.#size);
    const tail = this.#head;
    return [...this.#buf.slice(tail), ...this.#buf.slice(0, tail)];
  }

  get length() { return this.#size; }
}
