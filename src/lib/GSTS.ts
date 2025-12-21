
export type GSTSOptions = {
  urlPattern: string,
}

/**
 * Gaussian Scale-space Terrain Shading
 */
export class GSTS {
  private readonly urlPattern: string;

  constructor(options: GSTSOptions) {
    this.urlPattern = options.urlPattern;
  }

  

}