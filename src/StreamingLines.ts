import { EventEmitter } from "stream";
import { StringDecoder } from "string_decoder";

// Adapted from VSCode's RipgrepParser.
export class StreamingLines extends EventEmitter {
    private stringDecoder: StringDecoder = new StringDecoder();
    private remainder = "";

    override on(event: 'line', listener: (line: string) => void): this
    {
        super.on(event, listener);
        return this;
    }

    public static bytesToLinesArray(buf: Buffer): string[] {
        let lines = new StreamingLines();
        var linesArr: string[] = [];

        lines.on('line', line => { linesArr.push(line); });

        lines.write(buf);
        lines.end();

        return linesArr;
    }

    public end(): void {
        this.handleDecodedData(this.stringDecoder.end());
    }

    public write(data: Buffer): void {
        this.handleDecodedData(this.stringDecoder.write(data));
    }

    private handleDecodedData(decodedData: string): void {
        // check for newline before appending to remainder
		let newlineIdx = decodedData.indexOf('\n');

		// If the previous data chunk didn't end in a newline, prepend it to this chunk
		const dataStr = this.remainder + decodedData;

        if (newlineIdx >= 0) {
			newlineIdx += this.remainder.length;
		} else {
			// Shortcut
			this.remainder = dataStr;
			return;
		}

		let prevIdx = 0;
		while (newlineIdx >= 0) {
			this.onLine(dataStr.substring(prevIdx, newlineIdx).trim()); // Trim handles \r\n.
			prevIdx = newlineIdx + 1;
			newlineIdx = dataStr.indexOf('\n', prevIdx);
		}

		this.remainder = dataStr.substring(prevIdx);
    }

    private onLine(line: string): void {
        this.emit('line', line);
    }
}
