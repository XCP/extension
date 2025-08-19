import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Skeleton, HeaderSkeleton } from '../skeleton';

describe('Skeleton', () => {
  it('should render skeleton element', () => {
    const { container } = render(<Skeleton />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.tagName.toLowerCase()).toBe('div');
  });

  it('should apply default animation and background classes', () => {
    const { container } = render(<Skeleton />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('animate-pulse');
    expect(skeleton).toHaveClass('bg-gray-200');
  });

  it('should apply default rounded-md class', () => {
    const { container } = render(<Skeleton />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('rounded-md');
  });

  it('should apply different rounded values', () => {
    const { rerender, container } = render(<Skeleton rounded="none" />);
    let skeleton = container.firstChild as HTMLElement;
    expect(skeleton).not.toHaveClass('rounded-md');
    expect(skeleton).not.toHaveClass('rounded-sm');
    
    rerender(<Skeleton rounded="sm" />);
    skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('rounded-sm');
    
    rerender(<Skeleton rounded="lg" />);
    skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('rounded-lg');
    
    rerender(<Skeleton rounded="full" />);
    skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('rounded-full');
  });

  it('should apply custom className', () => {
    const { container } = render(<Skeleton className="custom-class" />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveClass('custom-class');
    expect(skeleton).toHaveClass('animate-pulse'); // Should still have default classes
  });

  it('should apply width as pixel value when number', () => {
    const { container } = render(<Skeleton width={200} />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveStyle({ width: '200px' });
  });

  it('should apply width as string value', () => {
    const { container } = render(<Skeleton width="100%" />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveStyle({ width: '100%' });
  });

  it('should apply height as pixel value when number', () => {
    const { container } = render(<Skeleton height={50} />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveStyle({ height: '50px' });
  });

  it('should apply height as string value', () => {
    const { container } = render(<Skeleton height="2rem" />);
    
    const skeleton = container.firstChild as HTMLElement;
    // Check the actual style attribute value since computed styles may differ
    expect(skeleton.style.height).toBe('2rem');
  });

  it('should apply both width and height', () => {
    const { container } = render(<Skeleton width={300} height={100} />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveStyle({ width: '300px', height: '100px' });
  });

  it('should have aria-hidden attribute', () => {
    const { container } = render(<Skeleton />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toHaveAttribute('aria-hidden', 'true');
  });

  it('should not have inline styles when dimensions not provided', () => {
    const { container } = render(<Skeleton />);
    
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.width).toBe('');
    expect(skeleton.style.height).toBe('');
  });
});

describe('HeaderSkeleton', () => {
  it('should render header skeleton with image and text skeletons', () => {
    const { container } = render(<HeaderSkeleton />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex');
    expect(wrapper).toHaveClass('items-center');
    
    // Should have 3 skeleton elements (image, title, subtitle)
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    expect(skeletons).toHaveLength(3);
  });

  it('should render balance variant by default', () => {
    const { container } = render(<HeaderSkeleton />);
    
    const wrapper = container.firstChild as HTMLElement;
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    
    // Image skeleton
    expect(skeletons[0]).toHaveStyle({ width: '48px', height: '48px' });
    expect(skeletons[0]).toHaveClass('rounded-md');
    
    // Title skeleton
    expect(skeletons[1]).toHaveStyle({ width: '120px', height: '24px' });
    
    // Subtitle skeleton
    expect(skeletons[2]).toHaveStyle({ width: '160px', height: '16px' });
  });

  it('should render asset variant', () => {
    const { container } = render(<HeaderSkeleton variant="asset" />);
    
    const wrapper = container.firstChild as HTMLElement;
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    
    // Title should be 120px for asset variant
    expect(skeletons[1]).toHaveStyle({ width: '120px' });
    // Subtitle should be 160px
    expect(skeletons[2]).toHaveStyle({ width: '160px' });
  });

  it('should render address variant with different dimensions', () => {
    const { container } = render(<HeaderSkeleton variant="address" />);
    
    const wrapper = container.firstChild as HTMLElement;
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    
    // Image should be rounded-full for address
    expect(skeletons[0]).toHaveClass('rounded-full');
    
    // Title should be wider (180px) for address variant
    expect(skeletons[1]).toHaveStyle({ width: '180px' });
    
    // Subtitle should be 140px
    expect(skeletons[2]).toHaveStyle({ width: '140px' });
  });

  it('should hide subtitle when showSubtitle is false', () => {
    const { container } = render(<HeaderSkeleton showSubtitle={false} />);
    
    const wrapper = container.firstChild as HTMLElement;
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    
    // Should only have 2 skeleton elements (image, title)
    expect(skeletons).toHaveLength(2);
  });

  it('should apply custom className', () => {
    const { container } = render(<HeaderSkeleton className="custom-header-class" />);
    
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('custom-header-class');
    expect(wrapper).toHaveClass('flex'); // Should still have default classes
  });

  it('should apply correct spacing classes', () => {
    const { container } = render(<HeaderSkeleton />);
    
    const wrapper = container.firstChild as HTMLElement;
    const imageSkeleton = wrapper.querySelector('.animate-pulse') as HTMLElement;
    
    // Image skeleton should have margin-right
    expect(imageSkeleton).toHaveClass('mr-4');
    
    // Title skeleton should have margin-bottom when subtitle is shown
    const titleSkeleton = wrapper.querySelectorAll('.animate-pulse')[1] as HTMLElement;
    expect(titleSkeleton).toHaveClass('mb-1');
  });

  it('should not apply margin-bottom to title when subtitle is hidden', () => {
    const { container } = render(<HeaderSkeleton showSubtitle={false} />);
    
    const wrapper = container.firstChild as HTMLElement;
    const titleSkeleton = wrapper.querySelectorAll('.animate-pulse')[1] as HTMLElement;
    
    expect(titleSkeleton).not.toHaveClass('mb-1');
  });

  it('should use custom imageRounded prop', () => {
    const { container } = render(<HeaderSkeleton imageRounded="full" />);
    
    const wrapper = container.firstChild as HTMLElement;
    const imageSkeleton = wrapper.querySelector('.animate-pulse') as HTMLElement;
    
    expect(imageSkeleton).toHaveClass('rounded-full');
  });

  it('should default imageRounded to full for address variant', () => {
    const { container } = render(<HeaderSkeleton variant="address" />);
    
    const wrapper = container.firstChild as HTMLElement;
    const imageSkeleton = wrapper.querySelector('.animate-pulse') as HTMLElement;
    
    expect(imageSkeleton).toHaveClass('rounded-full');
  });

  it('should default imageRounded to md for non-address variants', () => {
    const { container } = render(<HeaderSkeleton variant="balance" />);
    
    const wrapper = container.firstChild as HTMLElement;
    const imageSkeleton = wrapper.querySelector('.animate-pulse') as HTMLElement;
    
    expect(imageSkeleton).toHaveClass('rounded-md');
  });

  it('should have consistent dimensions for preventing CLS', () => {
    const { container } = render(<HeaderSkeleton />);
    
    const wrapper = container.firstChild as HTMLElement;
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    
    // All skeletons should have defined dimensions
    skeletons.forEach(skeleton => {
      const element = skeleton as HTMLElement;
      expect(element.style.width).toBeTruthy();
      expect(element.style.height).toBeTruthy();
    });
  });

  it('should have aria-hidden on all skeleton elements', () => {
    const { container } = render(<HeaderSkeleton />);
    
    const wrapper = container.firstChild as HTMLElement;
    const skeletons = wrapper.querySelectorAll('.animate-pulse');
    
    skeletons.forEach(skeleton => {
      expect(skeleton).toHaveAttribute('aria-hidden', 'true');
    });
  });
});